import {setTimeout as timeout} from 'node:timers/promises';
import kleur from 'kleur';
import {WebSocket} from 'ws';
import {
  ExecutionResult,
  ExecutionStatus,
  TestDetails,
  TestExecutionData,
  TestExecutionDetails,
  TestSuiteDetails,
  TestSuiteExecutionData,
  TestSuiteExecutionDetails,
} from './types';
import {Connection} from './connection';
import * as write from './write';

export interface Entity {
  get(): Promise<TestDetails | TestSuiteDetails>;
  getExecution(id: string): Promise<TestExecutionDetails | TestSuiteExecutionDetails>;
  schedule(input: TestExecutionData | TestSuiteExecutionData): Promise<TestSuiteExecutionDetails | TestExecutionDetails>;
  getResult(details: TestExecutionDetails | TestSuiteExecutionDetails): ExecutionResult;
  watchExecution(id: string): Promise<void>;
}

export class TestEntity implements Entity {
  public constructor(private client: Connection, public id: string) {
  }

  public get(): Promise<TestDetails> {
    return this.client.getTestDetails(this.id);
  }

  public getExecution(id: string): Promise<TestExecutionDetails> {
    return this.client.getTestExecutionDetails(id);
  }

  public schedule(data: TestExecutionData): Promise<TestExecutionDetails> {
    return this.client.scheduleTestExecution(this.id, data);
  }

  public getResult(data: TestExecutionDetails): ExecutionResult {
    return data.executionResult;
  }

  public watchExecution(id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let conn: WebSocket;
      let timeoutRef: NodeJS.Timeout;
      let done = false;

      const buildWebSocket = () => {
        const ws = this.client.openLogsSocket(id);
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
        const {executionResult: {status}} = await this.client.getTestExecutionDetails(id, true)
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
  }
}

export class TestSuiteEntity implements Entity {
  public constructor(private client: Connection, public id: string) {
  }

  public get(): Promise<TestSuiteDetails> {
    return this.client.getTestSuiteDetails(this.id);
  }

  public getExecution(id: string): Promise<TestSuiteExecutionDetails> {
    return this.client.getTestSuiteExecutionDetails(id);
  }

  public schedule(data: TestSuiteExecutionData): Promise<TestSuiteExecutionDetails> {
    return this.client.scheduleTestSuiteExecution(this.id, data);
  }

  public getResult(data: TestSuiteExecutionDetails): ExecutionResult {
    const errorMessage = data.stepResults
      .map(x => x.execution.executionResult)
      .filter((x) => x.status === ExecutionStatus.failed && x.errorMessage)
      .map((x) => x.errorMessage)
      .join(', ');
    return {
      status: data.status,
      errorMessage: errorMessage,
    };
  }

  public async watchExecution(id: string): Promise<void> {
    const movements: Record<Exclude<ExecutionStatus, ExecutionStatus.queued>, number[]> = {
      [ExecutionStatus.running]: [],
      [ExecutionStatus.cancelled]: [],
      [ExecutionStatus.passed]: [],
      [ExecutionStatus.failed]: [],
    };

    while (true) {
      await timeout(1000);

      const {status, stepResults} = await this.client.getTestSuiteExecutionDetails(id);
      const statusColors: Record<keyof typeof movements, (txt: string) => string> = {
        [ExecutionStatus.passed]: kleur.green,
        [ExecutionStatus.failed]: kleur.red,
        [ExecutionStatus.running]: kleur.gray,
        [ExecutionStatus.cancelled]: kleur.red,
      };

      for (let index = 0; index < stepResults.length; index++) {
        const {step, execution} = stepResults[index];
        const name = step.delay ? `🕑 ${step.delay.duration}ms` : step.execute?.name;
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
}
