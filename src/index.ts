import {setTimeout as timeout} from 'node:timers/promises';
import {getInput} from '@actions/core';
import {parse as parseEnv} from 'dotenv';
import kleur from 'kleur';
import type {WebSocket} from 'ws';
import * as write from './write';
import {Connection, resolveConfig} from './connection';
import {ActionInput, TestExecutionStatus, Variable} from './types';
import {runningContext} from './config';

// Configure

const input: ActionInput = {
  test: getInput('test'),
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

// Constants

const client = new Connection(await resolveConfig(input));

// Validate inputs

if (!input.test) {
  write.critical('You need to provide test ID to run');
}

// Get test details

write.header('Obtaining details');
const details = await client.getTestDetails(input.test);

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
const execution = await client.scheduleTestExecution(input.test, {
  name: input.executionName || undefined,
  preRunScript: input.preRunScript || undefined,
  variables: Object.keys(variables).length > 0 ? {...details.executionRequest?.variables, ...variables} : undefined,
  contentRequest: input.ref ? {repository: {commit: input.ref}} : undefined,
  runningContext,
});
write.log(`Execution scheduled: ${execution.name} (${execution.id})`);

// Stream logs
write.header('Attaching to logs');

await new Promise<void>((resolve) => {
  let conn: WebSocket;
  let timeoutRef: NodeJS.Timeout;

  const buildWebSocket = () => {
    const ws = client.openLogsSocket(execution.id);
    let failed = false;

    ws.on('error', () => {
      // Back-end may return falsely 400, so ignore errors and reconnect
      failed = true;
      conn = buildWebSocket();
      write.log(kleur.italic('Reconnecting...'));
      ws.close();
    });

    ws.on('close', () => {
      if (!failed) {
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
          if (dataToJSON.status === TestExecutionStatus.failed) {
            write.log(`Test run failed: ${dataToJSON.errorMessage || 'failure'}`);
            resolve();
            ws.close();
            clearTimeout(timeoutRef);
          } else if (dataToJSON.status === TestExecutionStatus.passed) {
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
    const {executionResult: {status}} = await client.getExecutionDetails(execution.id, true)
      .catch(() => ({executionResult: {status:TestExecutionStatus.queued}}));
    if ([TestExecutionStatus.passed, TestExecutionStatus.failed, TestExecutionStatus.cancelled].includes(status)) {
      resolve();
      conn.close();
      return;
    }
    timeoutRef = setTimeout(tick, 2000);
  };
  timeoutRef = setTimeout(tick, 2000);
});

// Obtain result
write.header('Obtaining test results');
await timeout(500); // wait, so CRD will be surely up-to-date
const {executionResult} = await client.getExecutionDetails(execution.id);
const {status, errorMessage} = executionResult || {};

// Show the result
if (status === 'passed') {
  process.stdout.write(kleur.green().bold(`✔ The run was successful\n`));
} else if (status === 'cancelled') {
  process.stdout.write(kleur.red().bold(`× The run has been cancelled\n`));
} else {
  process.stdout.write(kleur.red().bold(`× The run has failed: ${errorMessage || 'failure'}\n`));
}

// Show clarification for negative test
if (details.executionRequest?.negativeTest) {
  if (status === 'passed') {
    process.stdout.write(kleur.italic(`  Test run was expected to fail, and it failed as expected\n`));
  } else if (status === 'failed') {
    process.stdout.write(kleur.italic(`  Test run was expected to fail, but it succeed\n`));
  }
}

// Exit code depending on result
if (status !== 'passed') {
  process.exit(1);
}
