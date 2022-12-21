import type Generator from 'yeoman-generator';
import type RunContext from './run-context.js';

class TestContext {
  private runContext?: RunContext<any>;

  startNewContext(runContext: RunContext<any>) {
    this.runContext?.cleanupTemporaryDir();
    this.runContext = runContext;
  }
}

export default new TestContext();
