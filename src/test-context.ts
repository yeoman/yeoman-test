import type RunContext from './run-context.js';

class TestContext {
  autoCleanup = false;

  private runContext?: RunContext;

  startNewContext(runContext: RunContext) {
    if (this.autoCleanup) {
      this.runContext?.cleanupTemporaryDir();
    }
    this.runContext = runContext;
  }
}

export default new TestContext();
