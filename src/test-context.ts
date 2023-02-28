import type RunContext from './run-context.js';
import type RunResult from './run-result.js';

class TestContext {
  runResult?: RunResult;
  private runContext?: RunContext<any>;

  startNewContext(runContext: RunContext<any>) {
    this.runContext?.cleanupTemporaryDir();
    this.runContext = runContext;
    this.runResult = undefined;
  }
}

const testContext = new TestContext();

export default testContext;

const handler2 = {
  get(_target, prop, receiver) {
    if (testContext.runResult === undefined) {
      throw new Error('Last result is missing.');
    }

    return Reflect.get(testContext.runResult, prop, receiver);
  },
};

/**
 * Provides a proxy for last executed context result.
 */
export const result: RunResult = new Proxy({}, handler2);
