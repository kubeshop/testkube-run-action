import {setTimeout as timeout} from 'node:timers/promises';
import {getInput} from '@actions/core';
import {parse as parseEnv} from 'dotenv';
import kleur from 'kleur';
import type {WebSocket} from 'ws';
import * as write from './write';
import {Connection, resolveConfig} from './connection';
import {ActionInput, ExecutionStatus, TestExecutionDetails, TestSuiteExecutionDetails, Variable} from './types';
import {runningContext} from './config';

// Configure

const input: ActionInput = {
  test: getInput('test'),
  testSuite: getInput('testSuite'),
  ref: getInput('ref'),
  variables: parseEnv(getInput('variables') || ''),
  secretVariables: parseEnv(getInput('secretVariables') || ''),
  preRunScript: getInput('preRunScript'),

  executionName: getInput('executionName'),

  url: getInput('url'),
  ws: getInput('ws'),

  organization: getInput('organization'),
  environment: getInput('environment'),
  token: getInput('token'),
};

// Validate inputs

if (!input.test && !input.testSuite) {
  write.critical('You need to provide test ID or testSuite ID to run');
}
if (input.testSuite && input.ref) {
  write.critical('You cannot override Git ref for the test suite');
}
if (input.testSuite && input.preRunScript) {
  write.critical('You cannot override pre-run script for the test suite');
}

// Constants

const client = new Connection(await resolveConfig(input));

// Get test details

write.header('Obtaining details');
const details = input.test
  ? await client.getTestDetails(input.test)
  : await client.getTestSuiteDetails(input.testSuite!);

if (!['git', 'git-dir', 'git-file'].includes(details.content?.type!) && input.ref) {
  write.critical('Git revision provided, but the test is not sourced from Git.');
}

// Build variables

const variables: Record<string, Variable> = {};
for (const [name, value] of Object.entries(input.variables || {})) {
  variables[name] = {name, type: 'basic', value};
}
for (const [name, value] of Object.entries(input.secretVariables || {})) {
  variables[name] = {name, type: 'secret', value};
}

// Run test

write.header('Scheduling test execution');
const executionInput = {
  name: input.executionName || undefined,
  preRunScript: input.preRunScript || undefined,
  variables: Object.keys(variables).length > 0 ? {...details.executionRequest?.variables, ...variables} : undefined,
  contentRequest: input.ref ? {repository: {commit: input.ref}} : undefined,
  runningContext,
};
const execution = input.test
  ? await client.scheduleTestExecution(input.test, executionInput)
  : await client.scheduleTestSuiteExecution(input.testSuite!, executionInput);

write.log(`Execution scheduled: ${execution.name} (${execution.id})`);

// Stream logs
if (input.test) {
  write.header('Attaching to logs');

  await new Promise<void>((resolve) => {
    let conn: WebSocket;
    let timeoutRef: NodeJS.Timeout;
    let done = false;

    const buildWebSocket = () => {
      const ws = client.openLogsSocket(execution.id);
      let failed = false;

      ws.on('error', () => {
        // Back-end may return falsely 400, so ignore errors and reconnect
        failed = true;
        if (!done) {
          conn = buildWebSocket();
          write.log(kleur.italic('Reconnecting...'));
        }
        ws.close();
      });

      ws.on('close', () => {
        if (!failed) {
          done = true;
          clearTimeout(timeoutRef);
          resolve();
        }
      });

      ws.on('message', (logData) => {
        if (!logData) {
          return;
        }
        try {
          const dataToJSON = JSON.parse(logData as any);
          const potentialOutput = dataToJSON?.result?.output || dataToJSON?.output;

          if (potentialOutput) {
            write.log(potentialOutput);
            if (dataToJSON.status === ExecutionStatus.failed) {
              write.log(`Test run failed: ${dataToJSON.errorMessage || 'failure'}`);
              resolve();
              ws.close();
              clearTimeout(timeoutRef);
            } else if (dataToJSON.status === ExecutionStatus.passed) {
              write.log('Test run succeed\n');
              resolve();
              ws.close();
              clearTimeout(timeoutRef);
            }
            return;
          }

          if (dataToJSON.content) {
            write.log(dataToJSON.content);
          } else {
            write.log(logData);
          }
        } catch (err) {
          write.log(logData);
        }
      });

      return ws;
    };
    conn = buildWebSocket();

    // Poll results as well, because there are problems with WS
    const tick = async () => {
      const {executionResult: {status}} = await client.getTestExecutionDetails(execution.id, true)
          .catch(() => ({executionResult: {status: ExecutionStatus.queued}}));
      if ([ExecutionStatus.passed, ExecutionStatus.failed, ExecutionStatus.cancelled].includes(status)) {
        done = true;
        resolve();
        conn.close();
        return;
      }
      timeoutRef = setTimeout(tick, 2000);
    };
    timeoutRef = setTimeout(tick, 2000);
  });
} else {
  write.header('Watching steps');

  const movements: Record<Exclude<ExecutionStatus, ExecutionStatus.queued>, number[]> = {
    [ExecutionStatus.running]: [],
    [ExecutionStatus.cancelled]: [],
    [ExecutionStatus.passed]: [],
    [ExecutionStatus.failed]: [],
  };

  while (true) {
    await timeout(1000);

    const {status, stepResults} = await client.getTestSuiteExecutionDetails(execution.id);
    const statusColors: Record<keyof typeof movements, (txt: string) => string> = {
      [ExecutionStatus.passed]: kleur.green,
      [ExecutionStatus.failed]: kleur.red,
      [ExecutionStatus.running]: kleur.gray,
      [ExecutionStatus.cancelled]: kleur.red,
    };

    for (let index = 0; index < stepResults.length; index++) {
      const {step, execution} = stepResults[index];
      const name = step.delay ? `Delay: ${step.delay.duration}ms` : step.execute?.name;
      const {status} = execution.executionResult;
      if (status === ExecutionStatus.queued || !status) {
        continue;
      }
      if (!movements[status].includes(index)) {
        movements[status].push(index);
        process.stdout.write(statusColors[status](`[${status}] ${name}\n`));
      }
    }

    if ([ExecutionStatus.passed, ExecutionStatus.failed, ExecutionStatus.cancelled].includes(status)) {
      break;
    }
  }
}

// Obtain result
write.header('Obtaining results');
await timeout(500); // wait, so CRD will be surely up-to-date
const result = input.test
  ? await client.getTestExecutionDetails(execution.id)
  : await client.getTestSuiteExecutionDetails(execution.id);
const status = input.test
  ? (result as TestExecutionDetails).executionResult?.status
  : (result as TestSuiteExecutionDetails).status;
const errorMessage = input.test
  ? (result as TestExecutionDetails).executionResult?.errorMessage
  : (result as TestSuiteExecutionDetails).stepResults
        .map(x => x.execution.executionResult)
        .filter((x) => x.status === ExecutionStatus.failed && x.errorMessage)
        .map((x) => x.errorMessage)
        .join(', ');

// Show the result
if (status === ExecutionStatus.passed) {
  process.stdout.write(kleur.green().bold(`✔ The run was successful\n`));
} else if (status === ExecutionStatus.cancelled) {
  process.stdout.write(kleur.red().bold(`× The run has been cancelled\n`));
} else {
  process.stdout.write(kleur.red().bold(`× The run has failed: ${errorMessage || 'failure'}\n`));
}

// Show clarification for negative test
if (details.executionRequest?.negativeTest) {
  if (status === ExecutionStatus.passed) {
    process.stdout.write(kleur.italic(`  Test run was expected to fail, and it failed as expected\n`));
  } else if (status === ExecutionStatus.failed) {
    process.stdout.write(kleur.italic(`  Test run was expected to fail, but it succeed\n`));
  }
}

// Exit code depending on result
if (status !== ExecutionStatus.passed) {
  process.exit(1);
}
