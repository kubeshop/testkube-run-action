import {URL} from 'node:url';
import {escape} from 'node:querystring';
import got from 'got';
import {WebSocket} from 'ws';
import * as write from './write';
import {sanitizeUrl, handleHttpError} from './utils';
import {defaultInstance, instanceAliases, knownInstances, knownSuffixes} from './config';
import {
  ActionInput,
  ConnectionConfig,
  TestDetails,
  TestExecutionData,
  TestExecutionDetails,
  TestSource,
  TestSuiteDetails, TestSuiteDetailsV2,
  TestSuiteExecutionData,
  TestSuiteExecutionDetails,
  TestSuiteExecutionDetailsV2,
  TestSuiteStep,
} from './types';

function mapExecute(execute: any): TestSuiteStep[] {
  if (!execute) {
    return [];
  }
  return ([] as TestSuiteStep[])
    .concat(execute!)
    .map(item =>
      'name' in item ? {test: item.name as string} : 'duration' in item ? {delay: (item as any).duration} : item
    );
}

function isTestSuiteExecutionV2(execution: any): execution is TestSuiteExecutionDetailsV2 {
  return execution && 'stepResults' in execution;
}

function isTestSuiteV2(suite: any): suite is TestSuiteDetailsV2 {
  return !Array.isArray(suite?.steps?.[0]?.execute || []);
}

export async function resolveConfig(config: ActionInput): Promise<ConnectionConfig> {
  // Sanitize URLs
  const sanitizedApiUrl = sanitizeUrl(config.url || defaultInstance, 'http');
  const sanitizedWsUrl = sanitizeUrl(config.ws || sanitizedApiUrl, 'ws');
  const sanitizedDashboardUrl = config.dashboardUrl ? sanitizeUrl(config.dashboardUrl, 'http') : undefined;

  // Auto-resolve known hosts
  const {host} = new URL(sanitizedApiUrl);
  const detected = knownInstances[instanceAliases[host] || host];
  const cloud = Boolean(detected || config.organization || config.environment);
  let baseUrl = detected?.api || sanitizedApiUrl;
  let baseWsUrl = detected?.ws || sanitizedWsUrl;
  let baseDashboardUrl = detected?.dashboard || sanitizedDashboardUrl;

  // Try to detect the dashboard's URL based on the API URL, using common patterns
  if (!baseDashboardUrl) {
    if (baseUrl.endsWith('/results/v1')) {
      baseDashboardUrl = baseUrl.replace(/\/results\/v1$/, '');
    } else if (/^https?:\/\/api\.[^/]+$/.test(baseUrl)) {
      baseDashboardUrl = baseUrl.replace('//api.', '//app.');
    }
  }

  if (cloud) {
    baseUrl = `${baseUrl}/organizations/${config.organization}/environments/${config.environment}/agent`;
    baseWsUrl = `${baseWsUrl}/organizations/${config.organization}/environments/${config.environment}/agent`;
    if (baseDashboardUrl) {
      baseDashboardUrl = `${baseDashboardUrl}/organization/${config.organization}/environment/${config.environment}/dashboard`;
    }
  } else {
    let foundSuffix = false;
    let lastErr = null;
    for (const suffix of knownSuffixes) {
      try {
        const res = await got(`${baseUrl}${suffix}/info`);

        // Ensure it's a valid response
        JSON.parse(res.body);

        // Detect if WS is using same server as REST
        const same = baseUrl.replace(/^[^:]+/, '') === baseWsUrl.replace(/^[^:]+/, '');

        // Follow 3xx redirection
        baseUrl = res.url.replace(/\/info$/, '');

        // Use same for them WS if it was not hardcoded differently
        if (same) {
          baseWsUrl = sanitizeUrl(baseUrl, 'ws');
        }

        foundSuffix = true;
        break;
      } catch (error) {
        lastErr = error;
      }
    }

    if (!foundSuffix) {
      write.critical(`Cannot connect to ${config.url} (${baseUrl}): ${lastErr}`);
    }
  }

  if (cloud && (!config.organization || !config.environment)) {
    write.critical('Both organization and environment are required for the TestKube Cloud');
  }

  return {
    url: baseUrl,
    ws: baseWsUrl,
    dashboard: baseDashboardUrl,
    token: config.token,
    cloud,
  };
}

export class Connection {
  c: ConnectionConfig;

  public constructor(config: ConnectionConfig) {
    this.c = config;
  }

  private buildHeaders(): Record<string, string> {
    return this.c.token ? {authorization: `Bearer ${this.c.token}`} : {};
  }

  private appendTokenQs(url: string): string {
    return this.c.token ? `${url}?token=${escape(this.c.token)}` : url;
  }

  public get<T = any>(path: string, allowFailure?: boolean): Promise<T> {
    const promise: Promise<T> = got(`${this.c.url}${path}`, {headers: this.buildHeaders()}).json();
    if (!allowFailure) {
      return promise.catch(handleHttpError) as any;
    }
    return promise;
  }

  public post<T = any, U = any>(path: string, data: U, allowFailure?: boolean): Promise<T> {
    const promise: Promise<T> = got.post(`${this.c.url}${path}`, {headers: this.buildHeaders(), json: data}).json();
    if (!allowFailure) {
      return promise.catch(handleHttpError) as any;
    }
    return promise;
  }

  public ws(path: string): WebSocket {
    return new WebSocket(this.appendTokenQs(`${this.c.ws}${path}`));
  }

  getTestDetails(testId: string, allowFailure?: boolean): Promise<TestDetails> {
    return this.get<TestDetails>(`/tests/${testId}`, allowFailure);
  }

  public async getTestSuiteDetails(testSuiteId: string, allowFailure?: boolean): Promise<TestSuiteDetails> {
    const suite = await this.get<TestSuiteDetails | TestSuiteDetailsV2>(`/test-suites/${testSuiteId}`, allowFailure);

    // Convert V2 to V3
    if (isTestSuiteV2(suite)) {
      return {
        ...suite,
        steps: suite.steps?.map(step => ({
          stopOnFailure: step.stopTestOnFailure,
          execute: mapExecute(step.execute || (step as any).delay!),
        })),
      };
    }
    return suite;
  }

  scheduleTestExecution(testId: string, data: TestExecutionData, allowFailure?: boolean): Promise<TestExecutionDetails> {
    return this.post<TestExecutionDetails, TestExecutionData>(`/tests/${testId}/executions`, data, allowFailure);
  }

  scheduleTestSuiteExecution(testSuiteId: string, data: TestSuiteExecutionData, allowFailure?: boolean): Promise<TestSuiteExecutionDetails> {
    return this.post<TestSuiteExecutionDetails, TestSuiteExecutionData>(`/test-suites/${testSuiteId}/executions`, data, allowFailure);
  }

  getTestExecutionDetails(executionId: string, allowFailure?: boolean): Promise<TestExecutionDetails> {
    return this.get<TestExecutionDetails>(`/executions/${executionId}`, allowFailure);
  }

  public async getTestSuiteExecutionDetails(executionId: string, allowFailure?: boolean): Promise<TestSuiteExecutionDetails> {
    const execution = await this.get<TestSuiteExecutionDetails | TestSuiteExecutionDetailsV2>(`/test-suite-executions/${executionId}`, allowFailure);

    // Convert V2 to V3
    if (isTestSuiteExecutionV2(execution)) {
      const {stepResults, ...rest} = execution;
      return {
        ...rest,
        executeStepResults: stepResults.map((result: any) => ({
          execute: [{execution: result.execution, step: mapExecute(result.step.execute)?.[0]}],
          step: {...result.step, execute: mapExecute(result.step.execute)},
        })),
      };
    }
    return execution;
  }

  getSourceDetails(id: string, allowFailure?: boolean): Promise<TestSource> {
    return this.get<TestSource>(`/test-sources/${id}`, allowFailure);
  }

  openLogsSocket(executionId: string): WebSocket {
    return this.ws(`/executions/${executionId}/logs/stream`);
  }
}
