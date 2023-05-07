import process from 'node:process';
import type { BaseGenerator } from '@yeoman/types';
import type RunContext from './run-context.js';
import type RunResult from './run-result.js';

class TestContext {
  runResult?: RunResult<BaseGenerator>;
  private runContext?: RunContext<any>;

  startNewContext(runContext?: RunContext<any>) {
    this.runContext?.cleanupTemporaryDir();
    this.runContext = runContext;
    this.runResult = undefined;
  }
}

const testContext = new TestContext();

const cleanupTemporaryDir = () => {
  testContext.startNewContext();
};

process.on('exit', cleanupTemporaryDir);
process.on('SIGINT', cleanupTemporaryDir);
process.on('SIGTERM', cleanupTemporaryDir);

export default testContext;

const handler2: ProxyHandler<RunResult> = {
  get(_target: RunResult, prop: string, receiver: any) {
    if (testContext.runResult === undefined) {
      throw new Error('Last result is missing.');
    }

    return Reflect.get(testContext.runResult, prop, receiver);
  },
};

/**
 * Provides a proxy for last executed context result.
 */
export const result: RunResult = new Proxy({} as any, handler2);
