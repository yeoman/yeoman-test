/* eslint-disable max-nested-callbacks */
'use strict';
const assert = require('assert');
const fs = require('fs');
const MemFs = require('mem-fs');
const MemFsEditor = require('mem-fs-editor');
const path = require('path');
const sinon = require('sinon');

const RunContext = require('../lib/run-context');
const RunResult = require('../lib/run-result');

describe('run-result', () => {
  describe('constructor', () => {
    describe('without options', () => {
      it('uses current cwd', () => {
        assert.equal(new RunResult().cwd, process.cwd());
      });
    });
    describe('with fs option', () => {
      it('throws error without cwd', () => {
        assert.throws(() => new RunResult({memFs: {}}));
      });
    });
    describe('with fs and cwd options', () => {
      const memFs = {};
      const cwd = {};
      const options = {memFs, cwd};
      let runResult;
      before(() => {
        runResult = new RunResult(options);
      });
      it('loads memFs option', () => {
        assert.equal(runResult.memFs, memFs);
      });
      it('loads cwd option', () => {
        assert.equal(runResult.cwd, cwd);
      });
    });
    ['env', 'generator', 'oldCwd', 'cwd', 'mockedGenerators'].forEach(
      (optionName) => {
        describe(`with ${optionName} option`, () => {
          const optionValue = {};
          const options = {};
          let runResult;
          before(() => {
            options[optionName] = optionValue;
            runResult = new RunResult(options);
          });
          it('loads it', () => {
            assert.equal(runResult[optionName], optionValue);
          });
          it('loads options option', () => {
            assert.equal(runResult.options, options);
          });
        });
      }
    );
  });
  describe('#dumpFiles', () => {
    let runResult;
    let consoleMock;
    beforeEach(() => {
      const memFs = MemFs.create();
      const memFsEditor = MemFsEditor.create(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd()
      });
      consoleMock = sinon.stub(console, 'log');
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    afterEach(() => {
      consoleMock.restore();
    });
    it('dumps every file without an argument', () => {
      runResult.dumpFiles();
      assert.equal(consoleMock.callCount, 4);
      assert.equal(consoleMock.getCall(0).args[0], path.resolve('test.txt'));
      assert.equal(consoleMock.getCall(1).args[0], 'test content');
      assert.equal(consoleMock.getCall(2).args[0], path.resolve('test2.txt'));
      assert.equal(consoleMock.getCall(3).args[0], 'test2 content');
    });
    it('dumps a file with an argument', () => {
      runResult.dumpFiles(path.resolve('test.txt'));
      assert.equal(consoleMock.callCount, 1);
      assert.equal(consoleMock.getCall(0).args[0], 'test content');
      runResult.dumpFiles(path.resolve('test2.txt'));
      assert.equal(consoleMock.callCount, 2);
      assert.equal(consoleMock.getCall(1).args[0], 'test2 content');
    });
  });
  describe('#dumpFilenames', () => {
    let runResult;
    let consoleMock;
    beforeEach(() => {
      const memFs = MemFs.create();
      const memFsEditor = MemFsEditor.create(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd()
      });
      consoleMock = sinon.stub(console, 'log');
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    afterEach(() => {
      consoleMock.restore();
    });
    it('dumps every filename', () => {
      runResult.dumpFilenames();
      assert.equal(consoleMock.callCount, 2);
      assert.equal(consoleMock.getCall(0).args[0], path.resolve('test.txt'));
      assert.equal(consoleMock.getCall(1).args[0], path.resolve('test2.txt'));
    });
  });
  describe('#getSnapshot', () => {
    let runResult;
    beforeEach(() => {
      const memFs = MemFs.create();
      const memFsEditor = MemFsEditor.create(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd()
      });
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    it('should return every changed file', () => {
      assert.deepEqual(runResult.getSnapshot(), {
        'test.txt': {
          contents: 'test content',
          state: 'modified'
        },
        'test2.txt': {
          contents: 'test2 content',
          state: 'modified'
        }
      });
    });
  });
  describe('#getSnapshotState', () => {
    let runResult;
    beforeEach(() => {
      const memFs = MemFs.create();
      const memFsEditor = MemFsEditor.create(memFs);
      runResult = new RunResult({
        memFs,
        fs: memFsEditor,
        cwd: process.cwd()
      });
      runResult.fs.write(path.resolve('test.txt'), 'test content');
      runResult.fs.write(path.resolve('test2.txt'), 'test2 content');
    });
    it('should return every changed file', () => {
      assert.deepEqual(runResult.getStateSnapshot(), {
        'test.txt': {
          state: 'modified'
        },
        'test2.txt': {
          state: 'modified'
        }
      });
    });
  });
  describe('#cleanup', () => {
    let cwd;
    let runResult;
    beforeEach(() => {
      cwd = path.join(process.cwd(), 'fixtures', 'tmp');
      if (!fs.existsSync(cwd)) {
        fs.mkdirSync(cwd);
      }

      runResult = new RunResult({
        cwd,
        oldCwd: path.join(process.cwd(), 'fixtures')
      });
    });
    afterEach(() => {});
    it('removes cwd', () => {
      assert.ok(fs.existsSync(runResult.cwd));
      runResult.cleanup();
      assert.ok(!fs.existsSync(runResult.cwd));
    });
  });
  describe('#create', () => {
    const newSettings = {newOnly: 'foo', overrided: 'newOverrided'};
    const newEnvOptions = {newOnlyEnv: 'bar', overridedEnv: 'newOverridedEnv'};
    const originalEnvOptions = {
      originalOnlyEnv: 'originalOnlyEnv',
      overridedEnv: 'originalOverridedEnv'
    };
    const originalSetting = {
      originalOnly: 'originalOnly',
      overrided: 'originalOverrided'
    };
    const memFs = {};
    let cwd;
    const oldCwd = {};
    let runContext;
    before(() => {
      cwd = process.cwd();
      runContext = new RunResult({
        memFs,
        cwd,
        oldCwd,
        envOptions: originalEnvOptions,
        settings: originalSetting
      }).create('foo', newSettings, newEnvOptions);
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
    it('forwards memFs from the original RunResult to new envOptions', () => {
      assert.equal(runContext.envOptions.memFs, memFs);
    });
    it('prefers settings passed to the method', () => {
      assert.equal(runContext.settings.overrided, 'newOverrided');
    });
    it('prefers envOptions passed to the method', () => {
      assert.equal(runContext.envOptions.overridedEnv, 'newOverridedEnv');
    });
  });
});
