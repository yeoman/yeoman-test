import type Generator from 'yeoman-generator';
import type RunContext from './run-context.js';

class TestContext {
  autoCleanup = false;

  private runContext?: RunContext<Generator>;

  startNewContext(runContext: RunContext<Generator>) {
    this.runContext?.cleanupTemporaryDir();
    this.runContext = runContext;
  }
}

export default new TestContext();
