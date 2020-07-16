/* eslint-disable max-nested-callbacks */
'use strict';
const assert = require('assert');

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
        assert.throws(() => new RunResult({fs: {}}));
      });
    });
    describe('with fs and cwd options', () => {
      const fs = {};
      const cwd = {};
      const options = {fs, cwd};
      let runResult;
      before(() => {
        runResult = new RunResult(options);
      });
      it('loads fs option', () => {
        assert.equal(runResult.cwd, cwd);
      });
      it('loads cwd option', () => {
        assert.equal(runResult.cwd, cwd);
      });
    });
    ['env', 'oldCwd', 'cwd'].forEach((optionName) => {
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
    });
  });
  describe('#createContext', () => {
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
    const fs = {};
    let cwd;
    const oldCwd = {};
    let runContext;
    before(() => {
      cwd = process.cwd();
      runContext = new RunResult({
        fs,
        cwd,
        oldCwd,
        envOptions: originalEnvOptions,
        settings: originalSetting
      }).createContext('foo', newSettings, newEnvOptions);
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
    it('forwards fs from the original RunResult to new envOptions', () => {
      assert.equal(runContext.envOptions.fs, fs);
    });
    it('prefers settings passed to the method', () => {
      assert.equal(runContext.settings.overrided, 'newOverrided');
    });
    it('prefers envOptions passed to the method', () => {
      assert.equal(runContext.envOptions.overridedEnv, 'newOverridedEnv');
    });
  });
});
