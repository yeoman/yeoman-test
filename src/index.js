/* eslint-disable max-params */
import {mkdirSync, existsSync, rmSync} from 'node:fs';
import crypto from 'node:crypto';
import {join, resolve} from 'node:path';
import process from 'node:process';
import _ from 'lodash';
import sinon from 'sinon';
import tempDirectory from 'temp-dir';
import YeomanGenerator from 'yeoman-generator';
import Environment from 'yeoman-environment';

import {DummyPrompt, TestAdapter} from './adapter.js';
import RunContext from './run-context.js';

/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @class YeomanTest
 */

export class YeomanTest {
  /**
   * Clean-up the test directory and cd into it.
   * Call given callback after entering the test directory.
   * @param {String} dir - path to the test directory
   * @param {Function} cb - callback executed after setting working directory to dir
   * @example
   * testDirectory(path.join(__dirname, './temp'), function () {
   *   fs.writeFileSync('testfile', 'Roses are red.');
   * });
   */

  testDirectory(dir, cb) {
    if (!dir) {
      throw new Error('Missing directory');
    }

    dir = resolve(dir);

    // Make sure we're not deleting CWD by moving to top level folder. As we `cd` in the
    // test dir after cleaning up, this shouldn't be perceivable.
    process.chdir('/');

    try {
      if (existsSync(dir)) {
        rmSync(dir, {recursive: true});
      }

      mkdirSync(dir, {recursive: true});
      process.chdir(dir);
      cb();
    } catch (error) {
      return cb(error);
    }
  }

  /**
   * Clean-up the test directory and cd into it.
   * @param {string} [opts.temporaryDir] - Temporary dir to use
   * @param {boolean} [opts.cleanupTmpDir=!Boolean(opts.temporaryDir)] - Cleanup the temporary dir
   * @return Function cleanup callback
   * @example
   * testDirectory(path.join(__dirname, './temp'), function () {
   *   fs.writeFileSync('testfile', 'Roses are red.');
   * });
   */

  prepareTempDirectory({
    temporaryDir,
    cleanupTemporaryDir = !temporaryDir,
  } = {}) {
    const cwd = process.cwd();
    if (typeof temporaryDir !== 'string') {
      temporaryDir = resolve(
        join(tempDirectory, crypto.randomBytes(20).toString('hex')),
      );
    }

    // Make sure we're not deleting CWD by moving to top level folder. As we `cd` in the
    // test dir after cleaning up, this shouldn't be perceivable.
    process.chdir('/');

    if (existsSync(temporaryDir)) {
      rmSync(temporaryDir, {recursive: true});
    }

    mkdirSync(temporaryDir, {recursive: true});
    process.chdir(temporaryDir);

    const cleanup = () => {
      if (temporaryDir && cwd !== temporaryDir && cleanupTemporaryDir) {
        rmSync(temporaryDir, {recursive: true});
      }

      process.chdir(cwd);
    };

    cleanup.temporaryDir = temporaryDir;
    return cleanup;
  }

  /**
   * Answer prompt questions for the passed-in generator
   * @param {Generator|Environment} generator - a Yeoman generator or environment
   * @param {Object} answers - an object where keys are the
   *   generators prompt names and values are the answers to
   *   the prompt questions
   * @param {Function|Object} options - Options or callback
   * @example
   * mockPrompt(angular, {'bootstrap': 'Y', 'compassBoostrap': 'Y'});
   */

  mockPrompt(envOrGenerator, mockedAnswers, options) {
    envOrGenerator = envOrGenerator.env || envOrGenerator;
    const {promptModule} = envOrGenerator.adapter;

    for (const name of Object.keys(promptModule.prompts)) {
      promptModule.registerPrompt(
        name,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question, rl, answers) {
            super(mockedAnswers, options, question, rl, answers);
          }
        },
      );
    }
  }

  /**
   * Restore defaults prompts on a generator.
   * @param {Generator|Environment} generator or environment
   */
  restorePrompt(envOrGenerator) {
    envOrGenerator = envOrGenerator.env || envOrGenerator;
    envOrGenerator.adapter.promptModule.restoreDefaultPrompts();
  }

  /**
   * Provide mocked values to the config
   * @param  {Generator} generator - a Yeoman generator
   * @param  {Object} localConfig - localConfig - should look just like if called config.getAll()
   */
  mockLocalConfig(generator, localConfig) {
    generator.config.defaults(localConfig);
  }

  /**
   * Create a mocked generator
   */

  createMockedGenerator(
    Generator = class MockedGenerator extends YeomanGenerator {},
  ) {
    const generator = sinon.spy(Generator);
    for (const methodName of [
      'run',
      'queueTasks',
      'runWithOptions',
      'queueOwnTasks',
    ]) {
      if (Generator.prototype[methodName]) {
        generator.prototype[methodName] = sinon.stub();
      }
    }

    return generator;
  }

  /**
   * Create a simple, dummy generator
   */

  createDummyGenerator(Generator = YeomanGenerator) {
    return class extends Generator {
      test() {
        this.shouldRun = true;
      }
    };
  }

  /**
   * Create a generator, using the given dependencies and controller arguments
   * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
   *
   * @param {String} name - the name of the generator
   * @param {Array} dependencies - paths to the generators dependencies
   * @param {Array|String} args - arguments to the generator;
   *   if String, will be split on spaces to create an Array
   * @param {Object} options - configuration for the generator
   * @param {Boolean} [localConfigOnly=true] - passes localConfigOnly to the generators
   * @example
   *  var deps = ['../../app',
   *              '../../common',
   *              '../../controller',
   *              '../../main',
   *              [createDummyGenerator(), 'testacular:app']
   *            ];
   * var angular = createGenerator('angular:app', deps);
   */

  createGenerator(name, dependencies, args, options, localConfigOnly = true) {
    const env = this.createEnv([], {sharedOptions: {localConfigOnly}});
    this.registerDependencies(env, dependencies);

    return env.create(name, {arguments: args, options});
  }

  /**
   * Register a list of dependent generators into the provided env.
   * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
   *
   * @param {Array} dependencies - paths to the generators dependencies
   */

  registerDependencies(env, dependencies) {
    for (const dependency of dependencies) {
      if (Array.isArray(dependency)) {
        env.registerStub(...dependency);
      } else {
        env.register(dependency);
      }
    }
  }

  /**
   * Shortcut to the Environment's createEnv.
   *
   * @param {...any} args - environment constructor arguments.
   * @returns {Object} environment instance
   *
   * Use to test with specific Environment version:
   * let createEnv;
   * before(() => {
   *   createEnv = stub(helper, 'createEnv').callsFake(Environment.creatEnv);
   * });
   * after(() => {
   *   createEnv.restore();
   * });
   */

  createEnv(...args) {
    return Environment.createEnv(...args);
  }

  /**
   * Creates a test environment.
   *
   * @param {Function} envContructor - environment constructor method.
   * @param {Object} [options] - Options to be passed to the environment
   * @returns {Object} environment instance
   * const env = createTestEnv(require('yeoman-environment').createEnv);
   */

  createTestEnv(
    envContructor = this.createEnv,
    options = {localConfigOnly: true},
  ) {
    const envOptions = _.cloneDeep(this.environmentOptions || {});
    if (typeof options === 'boolean') {
      options = {
        newErrorHandler: true,
        ...envOptions,
        sharedOptions: {
          localConfigOnly: options,
          ...envOptions.sharedOptions,
        },
      };
    } else {
      options = {
        newErrorHandler: true,
        ...envOptions,
        ...options,
      };
      options.sharedOptions = {
        localConfigOnly: true,
        ...envOptions.sharedOptions,
        ...options.sharedOptions,
      };
    }

    return envContructor([], options, new TestAdapter());
  }

  /**
   * Get RunContext type
   * @return {RunContext}
   */

  getRunContextType() {
    return RunContext;
  }

  /**
   * Run the provided Generator
   * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
   * @return {RunContext}
   */

  run(GeneratorOrNamespace, settings, envOptions) {
    const contextSettings = _.cloneDeep(this.settings || {});
    const generatorOptions = _.cloneDeep(this.generatorOptions || {});
    const RunContext = this.getRunContextType();
    return new RunContext(
      GeneratorOrNamespace,
      {...contextSettings, ...settings},
      envOptions,
      this,
    ).withOptions(generatorOptions);
  }

  /**
   * Prepare a run context
   * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
   * @return {RunContext}
   */

  create(GeneratorOrNamespace, settings, envOptions) {
    return this.run(
      GeneratorOrNamespace,
      {...settings, runEnvironment: true},
      envOptions,
    );
  }
}

export default new YeomanTest();

export const createHelpers = (options) => {
  const helpers = new YeomanTest();
  Object.assign(helpers, options);
  return helpers;
};
