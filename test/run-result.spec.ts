import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { mock } from 'node:test';
import { create as createMemFs } from 'mem-fs';
import { create as createMemFsEditor } from 'mem-fs-editor';
import { afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import RunContext from '../src/run-context.js';
import RunResult from '../src/run-result.js';
import helpers from '../src/helpers.js';
import testContext, { result } from '../src/test-context.js';

describe('run-result', () => {
  describe('constructor', () => {
    describe('without options', () => {
      it('uses current cwd', () => {
        assert.equal(new RunResult({} as any).cwd, process.cwd());
      });
    });
    describe('with fs option', () => {
      it('throws error without cwd', () => {
        assert.throws(() => new RunResult({ memFs: {} } as any));
      });
    });
    describe('with fs and cwd options', () => {
      const memFs = {};
      const cwd = {};
      const options = { memFs, cwd };
      let runResult;
      beforeAll(() => {
        runResult = new RunResult(options as any);
      });
      it('loads memFs option', () => {
        assert.equal(runResult.memFs, memFs);
      });
      it('loads cwd option', () => {
        assert.equal(runResult.cwd, cwd);
      });
    });
    for (const optionName of ['env', 'generator', 'oldCwd', 'cwd', 'mockedGenerators']) {
      describe(`with ${optionName} option`, () => {
        const optionValue = {};
        const options = {};
        let runResult;
        beforeAll(() => {
          options[optionName] = optionValue;
          runResult = new RunResult(options as any);
        });
        it('loads it', () => {
          assert.equal(runResult[optionName], optionValue);
        });
        it('loads options option', () => {
          assert.equal(runResult.options, options);
        });
      });
    }
  });
  describe('#dumpFiles', () => {
    let runResult;
    let consoleMock: ReturnType<typeof mock.method>;
    beforeEach(() => {
      const memFs = createMemFs();
      const memFsEditor = createMemFsEditor(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd(),
      } as any);
      consoleMock = mock.method(console, 'log');
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    afterEach(() => {
      consoleMock.mock.restore();
    });
    it('dumps every file without an argument', () => {
      runResult.dumpFiles();
      assert.equal(consoleMock.mock.callCount(), 4);
      assert.equal(consoleMock.mock.calls[0].arguments[0], path.resolve('test.txt'));
      assert.equal(consoleMock.mock.calls[1].arguments[0], 'test content');
      assert.equal(consoleMock.mock.calls[2].arguments[0], path.resolve('test2.txt'));
      assert.equal(consoleMock.mock.calls[3].arguments[0], 'test2 content');
    });
    it('dumps a file with an argument', () => {
      runResult.dumpFiles(path.resolve('test.txt'));
      assert.equal(consoleMock.mock.callCount(), 1);
      assert.equal(consoleMock.mock.calls[0].arguments[0], 'test content');
      runResult.dumpFiles(path.resolve('test2.txt'));
      assert.equal(consoleMock.mock.callCount(), 2);
      assert.equal(consoleMock.mock.calls[1].arguments[0], 'test2 content');
    });
  });
  describe('#dumpFilenames', () => {
    let runResult;
    let consoleMock: ReturnType<typeof mock.method>;
    beforeEach(() => {
      const memFs = createMemFs();
      const memFsEditor = createMemFsEditor(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd(),
      } as any);
      consoleMock = mock.method(console, 'log');
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    afterEach(() => {
      consoleMock.mock.restore();
    });
    it('dumps every filename', () => {
      runResult.dumpFilenames();
      assert.equal(consoleMock.mock.callCount(), 2);
      assert.equal(consoleMock.mock.calls[0].arguments[0], path.resolve('test.txt'));
      assert.equal(consoleMock.mock.calls[1].arguments[0], path.resolve('test2.txt'));
    });
  });
  describe('#getSnapshot', () => {
    let runResult;
    beforeEach(() => {
      const memFs = createMemFs();
      const memFsEditor = createMemFsEditor(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd(),
      } as any);
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    it('should return every changed file', () => {
      assert.deepEqual(runResult.getSnapshot(), {
        'test.txt': {
          contents: 'test content',
          state: 'modified',
        },
        'test2.txt': {
          contents: 'test2 content',
          state: 'modified',
        },
      });
    });
  });
  describe('#getSnapshotState', () => {
    let runResult;
    beforeEach(() => {
      const memFs = createMemFs();
      const memFsEditor = createMemFsEditor(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd(),
      } as any);
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    it('should return every changed file', () => {
      assert.deepEqual(runResult.getStateSnapshot(), {
        'test.txt': {
          state: 'modified',
        },
        'test2.txt': {
          state: 'modified',
        },
      });
    });
  });
  describe('#cleanup', () => {
    let cwd;
    let runResult;
    beforeEach(() => {
      cwd = path.join(process.cwd(), 'fixtures', 'tmp');
      if (!fs.existsSync(cwd)) {
        fs.mkdirSync(cwd, { recursive: true });
      }

      runResult = new RunResult({
        cwd,
        oldCwd: path.join(process.cwd(), 'fixtures'),
      } as any);
    });
    afterEach(() => {});
    it('removes cwd', () => {
      assert.ok(fs.existsSync(runResult.cwd));
      runResult.cleanup();
      assert.ok(!fs.existsSync(runResult.cwd));
    });
  });
  describe('#create', () => {
    const newSettings = { newOnly: 'foo', overrided: 'newOverrided' };
    const newEnvironmentOptions = { newOnlyEnv: 'bar', overridedEnv: 'newOverridedEnv' };
    const originalEnvironmentOptions = {
      originalOnlyEnv: 'originalOnlyEnv',
      overridedEnv: 'originalOverridedEnv',
    };
    const originalSetting = {
      originalOnly: 'originalOnly',
      overrided: 'originalOverrided',
    };
    const memFs = {};
    let cwd;
    const oldCwd = {};
    let runContext;
    beforeAll(() => {
      cwd = process.cwd();
      runContext = new RunResult({
        memFs,
        cwd,
        oldCwd,
        envOptions: originalEnvironmentOptions,
        settings: originalSetting,
        helpers,
      } as any).create('foo', newSettings, newEnvironmentOptions);
    });
    it('returns a RunContext instance', () => {
      assert.ok(runContext instanceof RunContext);
    });
    it('forwards settings options', () => {
      assert.equal(runContext.settings.newOnly, 'foo');
    });
    it('forwards envOptions options', () => {
      assert.equal(runContext.envOptions.newOnlyEnv, 'bar');
    });
    it('forwards settings from the original RunResult', () => {
      assert.equal(runContext.settings.originalOnly, 'originalOnly');
    });
    it('forwards envOptions from the original RunResult', () => {
      assert.equal(runContext.envOptions.originalOnlyEnv, 'originalOnlyEnv');
    });
    it('forwards cwd from the original RunResult', () => {
      assert.equal(runContext.targetDirectory, cwd);
    });
    it('forwards oldCwd from the original RunResult', () => {
      assert.equal(runContext.oldCwd, oldCwd);
    });
    it('forwards memFs from the original RunResult to new RunContext', () => {
      assert.equal(runContext.memFs, memFs);
    });
    it('prefers settings passed to the method', () => {
      assert.equal(runContext.settings.overrided, 'newOverrided');
    });
    it('prefers envOptions passed to the method', () => {
      assert.equal(runContext.envOptions.overridedEnv, 'newOverridedEnv');
    });
  });
  describe('current runResult value', () => {
    describe('should proxy methods', () => {
      let runResult: RunResult;
      beforeEach(() => {
        const memFs = createMemFs();
        const memFsEditor = createMemFsEditor(memFs);
        runResult = new RunResult({
          memFs,
          fs: memFsEditor,
          cwd: process.cwd(),
        } as any);
        runResult.fs.write(path.resolve('test.txt'), 'test content');
        runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
        testContext.runResult = runResult;
      });
      for (const method of Object.getOwnPropertyNames(RunResult.prototype)) {
        it(`.${method}`, () => {
          assert.equal(result.assertFile, runResult.assertFile);
        });
      }
    });
  });

  it('provides mocked generators check helpers', async () => {
    const mockedNamespace = 'mocked:gen';
    const result = await helpers
      .run(
        helpers.createDummyGenerator(undefined, {
          async default() {
            await this.composeWith(mockedNamespace);
          },
        }),
      )
      .withMockedGenerators([mockedNamespace, 'another:gen']);

    result.assertGeneratorComposedOnce(mockedNamespace);
    result.assertGeneratorComposed(mockedNamespace);
    assert(result.getGeneratorComposeCount(mockedNamespace) === 1);
    assert.equal(result.getComposedGenerators().length, 1);
    assert(result.getComposedGenerators()[0] === mockedNamespace);

    result.assertGeneratorNotComposed('another:gen');
  });
});
