export interface ActionInput {
  test?: string;
  testSuite?: string;

  ref?: string;
  variables?: Record<string, string>;
  secretVariables?: Record<string, string>;
  preRunScript?: string;

  executionName?: string;

  url?: string;
  ws?: string;

  organization?: string;
  environment?: string;
  token?: string;
}

export interface ConnectionConfig {
  url: string;
  ws: string;
  token?: string;
  cloud: boolean;
}

export enum ExecutionStatus {
  passed = 'passed',
  failed = 'failed',
  cancelled = 'cancelled',
  running = 'running',
  queued = 'queued',
}

export interface Variable {
  name: string;
  type: 'basic' | 'secret';
  value?: string;
  secretRef?: {
    namespace: string;
    name: string;
    key: string;
  };
}

export interface TestDetails {
  executionRequest?: {
    negativeTest?: boolean;
    variables?: Record<string, Variable>;
  };
  content?: {
    type: string;
  };
}

export interface TestSuiteDetails {
  content?: undefined;
  executionRequest?: {
    negativeTest?: undefined;
    variables?: Record<string, Variable>;
  };
  steps: {
    stopTestOnFailure: boolean;
    execute: {
      name: string;
    };
  }[];
}

interface RunningContext {
  type: string;
  context: string;
}

export interface TestExecutionData {
  name?: string;
  command?: string[];
  args?: string[];
  httpProxy?: boolean;
  httpsProxy?: boolean;
  negativeTest?: boolean;
  uploads?: string[];
  jobTemplate?: string;
  preRunScript?: string;
  variables?: Record<string, Variable>;
  runningContext?: RunningContext;
  executionLabels?: Record<string, string>;
  contentRequest?: {
    repository?: {
      branch?: string;
      commit?: string;
      path?: string;
      workingDir?: string;
    };
  };
}

interface ExecutionResult {
  status: ExecutionStatus;
  errorMessage?: string;
}

export interface TestExecutionDetails {
  id: string;
  name: string;
  executionResult: ExecutionResult;
}

export interface TestSuiteExecutionData {
  name?: string;
  httpProxy?: boolean;
  httpsProxy?: boolean;
  variables?: Record<string, Variable>;
  runningContext?: RunningContext;
  executionLabels?: Record<string, string>;
}

export interface TestSuiteExecutionDetails {
  id: string;
  name: string;
  status: ExecutionStatus;
  stepResults: {
    step: {
      stopTestOnFailure: boolean;
      delay?: {
        duration: number;
      };
      execute?: {
        name: string;
      };
    };
    execution: {
      startTime: string;
      endTime: string;
      executionResult: ExecutionResult;
    };
  }[];
}
