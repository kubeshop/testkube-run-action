import {setTimeout as timeout} from 'node:timers/promises';
import {getInput} from '@actions/core';
import {parse as parseEnv} from 'dotenv';
import kleur from 'kleur';
import * as write from './write';
import {Connection, resolveConfig} from './connection';
import {ActionInput, ExecutionStatus, TestDetails} from './types';
import {TestEntity, TestSuiteEntity} from './entities';
import {formatVariables} from './utils';

// Configure

const input: ActionInput = {
  test: getInput('test'),
  testSuite: getInput('testSuite'),
  ref: getInput('ref'),
  variables: parseEnv(getInput('variables') || ''),
  secretVariables: parseEnv(getInput('secretVariables') || ''),
  preRunScript: getInput('preRunScript'),
  namespace: getInput('namespace'),

  executionName: getInput('executionName'),

  url: getInput('url'),
  ws: getInput('ws'),
  dashboardUrl: getInput('dashboardUrl'),

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
if (Boolean(input.environment) !== Boolean(input.organization) || Boolean(input.organization) !== Boolean(input.token)) {
  write.critical('You need to pass both environment, organization and token parameters when connecting to Cloud');
}
if (!input.organization && !input.url) {
  write.critical('You need to either pass URL of Testkube instance, or credentials for the Cloud');
}

// Constants

const config = await resolveConfig(input);
const client = new Connection(config);
const entity = input.test ? new TestEntity(client, input.test) : new TestSuiteEntity(client, input.testSuite!);

// Get test details

write.header('Obtaining details');
const details = await entity.get();
const sourceId = (details as TestDetails).source;
const source = sourceId ? await client.getSourceDetails(sourceId) : null;

if (input.ref && !['git', 'git-dir', 'git-file'].includes(details.content?.type || source?.type!)) {
  write.critical('Git revision provided, but the test is not sourced from Git.');
}

// Run test

write.header('Scheduling test execution');
const variables = formatVariables(input.variables, input.secretVariables);
const execution = await entity.schedule({
  name: input.executionName || undefined,
  preRunScript: input.preRunScript || undefined,
  namespace: input.namespace || undefined,
  variables: Object.keys(variables).length > 0 ? {...details.executionRequest?.variables, ...variables} : undefined,
  contentRequest: input.ref ? {repository: {commit: input.ref}} : undefined,
  runningContext: {
    type: 'githubaction',
    context: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  },
});

write.log(`Execution scheduled: ${execution.name} (${execution.id})`);
if (config.dashboard) {
  if (input.test) {
    write.log(`Dashboard URL: ${config.dashboard}/tests/executions/${input.test}/execution/${execution.id}`);
  } else {
    write.log(`Dashboard URL: ${config.dashboard}/test-suites/executions/${input.testSuite}/execution/${execution.id}`);
  }
}

// Stream logs
write.header('Attaching to logs');
await entity.watchExecution(execution.id);

// Obtain result
write.header('Obtaining results');
await timeout(500); // wait, so CRD will be surely up-to-date
const {status, errorMessage} = entity.getResult(await entity.getExecution(execution.id) as any);

// Show the result
if (status === ExecutionStatus.passed) {
  process.stdout.write(kleur.green().bold(`✔ The run was successful\n`));
} else if (status === ExecutionStatus.cancelled || status === ExecutionStatus.aborted) {
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
