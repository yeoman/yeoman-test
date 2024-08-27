import process from 'node:process';
import onExit from 'when-exit';
import type RunContext from './run-context.js';
import type RunResult from './run-result.js';

class TestContext {
  beforeCwd?: string;
  autoRestore = true;
  autoCleanup?: boolean;
  runResult?: RunResult;
  private runContext?: RunContext<any>;

  startNewContext(runContext?, autoCleanup = true) {
    if (this.beforeCwd !== process.cwd()) {
      if (this.autoCleanup) {
        this.runContext?.cleanupTemporaryDir();
      } else if (this.autoRestore) {
        this.runContext?.restore();
      }
    }

    if (this.beforeCwd && this.beforeCwd !== process.cwd()) {
      console.log('Test failed to restore context', this.beforeCwd, process.cwd());
    }

    this.autoCleanup = autoCleanup;
    this.beforeCwd = runContext ? process.cwd() : undefined;
    this.runContext = runContext;
    this.runResult = undefined;
  }
}

const testContext = new TestContext();

onExit(() => {
  testContext.startNewContext();
});

export default testContext;

const handler2: ProxyHandler<RunResult> = {
  get(_target: RunResult, property: string, receiver: any) {
    if (testContext.runResult === undefined) {
      throw new Error('Last result is missing.');
    }

    return Reflect.get(testContext.runResult, property, receiver);
  },
};

/**
 * Provides a proxy for last executed context result.
 */
export const result: RunResult = new Proxy({} as any, handler2);
