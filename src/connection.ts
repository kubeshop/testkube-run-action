import {URL} from 'node:url';
import {escape} from 'node:querystring';
import got from 'got';
import {WebSocket} from 'ws';
import * as write from './write';
import {sanitizeUrl, handleHttpError} from './utils';
import {defaultInstance, instanceAliases, knownInstances, knownSuffixes} from './config';
import {ActionInput, ConnectionConfig, TestDetails, TestExecutionData, TestExecutionDetails} from './types';

export async function resolveConfig(config: ActionInput): Promise<ConnectionConfig> {
  // Sanitize URLs
  const sanitizedApiUrl = sanitizeUrl(config.url || defaultInstance, 'http');
  const sanitizedWsUrl = sanitizeUrl(config.ws || sanitizedApiUrl, 'ws');

  // Auto-resolve known hosts
  const {host} = new URL(sanitizedApiUrl);
  const detected = knownInstances[instanceAliases[host] || host];
  const cloud = Boolean(detected || config.organization || config.environment);
  let baseUrl = detected?.api || sanitizedApiUrl;
  let baseWsUrl = detected?.ws || sanitizedWsUrl;

  if (cloud) {
    baseUrl = `${baseUrl}/organizations/${config.organization}/environments/${config.environment}/agent`;
    baseWsUrl = `${baseWsUrl}/organizations/${config.organization}/environments/${config.environment}/agent`;
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

  scheduleTestExecution(testId: string, data: TestExecutionData, allowFailure?: boolean): Promise<TestExecutionDetails> {
    return this.post<TestExecutionDetails, TestExecutionData>(`/tests/${testId}/executions`, data, allowFailure);
  }

  getExecutionDetails(executionId: string, allowFailure?: boolean): Promise<TestExecutionDetails> {
    return this.get<TestExecutionDetails>(`/executions/${executionId}`, allowFailure);
  }

  openLogsSocket(executionId: string): WebSocket {
    return this.ws(`/executions/${executionId}/logs/stream`);
  }
}
