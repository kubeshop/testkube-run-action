export interface ActionInput {
  test: string;
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

export enum TestExecutionStatus {
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
  runningContext?: {
    type: string;
    context: string;
  };
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

export interface TestExecutionDetails {
  id: string;
  name: string;
  executionResult: {
    status: TestExecutionStatus;
    errorMessage?: string;
  };
}
