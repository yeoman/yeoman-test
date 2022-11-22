/* eslint-disable max-params */
import {mkdirSync, existsSync, rmSync} from 'node:fs';
import crypto from 'node:crypto';
import {join, resolve} from 'node:path';
import process from 'node:process';
import _ from 'lodash';
import {spy as sinonSpy, stub as sinonStub} from 'sinon';
import tempDirectory from 'temp-dir';
import YeomanGenerator from 'yeoman-generator';
import Environment from 'yeoman-environment';
import type {GeneratorOptions} from 'yeoman-generator';
import type {Options, createEnv} from 'yeoman-environment';
import type {SinonSpiedInstance} from 'sinon';

import {DummyPrompt, TestAdapter} from './adapter.js';
import RunContext from './run-context.js';
import type {RunContextSettings} from './run-context.js';

/**
 * Dependencies can be path (autodiscovery) or an array [<generator>, <name>]
 */
export type Dependency = string | [Generator, string];

type GeneratorNew<GenParameter extends YeomanGenerator = YeomanGenerator> =
  new (
    ...args: ConstructorParameters<
      typeof YeomanGenerator<GenParameter['options']>
    >
  ) => YeomanGenerator<GenParameter['options']>;
type GeneratorBuilder<GenParameter extends YeomanGenerator = YeomanGenerator> =
  (
    ...args: ConstructorParameters<
      typeof YeomanGenerator<GenParameter['options']>
    >
  ) => YeomanGenerator<GenParameter['options']>;

export type GeneratorConstructor<
  GenParameter extends YeomanGenerator = YeomanGenerator,
> = GeneratorNew<GenParameter> | GeneratorBuilder<GenParameter>;

/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @class YeomanTest
 */

export class YeomanTest {
  settings?: RunContextSettings;
  environmentOptions?: Options;
  generatorOptions?: GeneratorOptions;

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

  testDirectory(dir, cb?: (error?) => unknown) {
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
      return cb?.();
    } catch (error) {
      return cb?.(error);
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
  }: {temporaryDir?: string; cleanupTemporaryDir?: boolean} = {}) {
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
   * @param generator - a Yeoman generator or environment
   * @param {Object} answers - an object where keys are the
   *   generators prompt names and values are the answers to
   *   the prompt questions
   * @param options - Options or callback
   * @example
   * mockPrompt(angular, {'bootstrap': 'Y', 'compassBoostrap': 'Y'});
   */

  mockPrompt(
    envOrGenerator: YeomanGenerator | Environment,
    mockedAnswers?: YeomanGenerator.Answers,
    options?,
  ) {
    const environment =
      'env' in envOrGenerator ? envOrGenerator.env : envOrGenerator;
    const {promptModule} = environment.adapter;

    for (const name of Object.keys(promptModule.prompts)) {
      promptModule.registerPrompt(
        name,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question, rl, answers) {
            super(mockedAnswers, options, question, rl, answers);
          }
        } as any,
      );
    }
  }

  /**
   * Restore defaults prompts on a generator.
   * @param {Generator|Environment} generator or environment
   */
  restorePrompt(envOrGenerator: YeomanGenerator | Environment) {
    const environment: Environment =
      (envOrGenerator as any).env ?? envOrGenerator;
    environment.adapter.promptModule.restoreDefaultPrompts();
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
    GeneratorClass: typeof YeomanGenerator<GeneratorOptions> = class MockedGenerator extends YeomanGenerator {},
  ): SinonSpiedInstance<typeof YeomanGenerator<GeneratorOptions>> {
    const generator = sinonSpy(GeneratorClass);
    for (const methodName of [
      'run',
      'queueTasks',
      'runWithOptions',
      'queueOwnTasks',
    ]) {
      if (GeneratorClass.prototype[methodName]) {
        generator.prototype[methodName] = sinonStub();
      }
    }

    return generator;
  }

  /**
   * Create a simple, dummy generator
   */

  createDummyGenerator<GenParameter extends YeomanGenerator = YeomanGenerator>(
    Generator = YeomanGenerator,
  ): typeof YeomanGenerator<GenParameter['options']> {
    class DummyGenerator extends Generator<GenParameter['options']> {
      shouldRun?: boolean;

      test() {
        this.shouldRun = true;
      }
    }
    return DummyGenerator;
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

  createGenerator<GeneratorType extends YeomanGenerator = YeomanGenerator>(
    name: string,
    dependencies: Dependency[],
    args?: string[],
    options?: YeomanGenerator.GeneratorOptions,
    localConfigOnly = true,
  ): GeneratorType {
    const env = this.createEnv([], {sharedOptions: {localConfigOnly}});
    this.registerDependencies(env, dependencies);

    return env.create<YeomanGenerator['options']>(
      name,
      args as any,
      options as any,
    ) as unknown as GeneratorType;
  }

  /**
   * Register a list of dependent generators into the provided env.
   * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
   *
   * @param {Array} dependencies - paths to the generators dependencies
   */

  registerDependencies(env, dependencies: Dependency[]) {
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

  createEnv(
    ...args: Parameters<typeof createEnv>
  ): ReturnType<typeof createEnv> {
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
    options: Environment.Options = {localConfigOnly: true},
  ) {
    const envOptions = _.cloneDeep(this.environmentOptions ?? {});
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

    return envContructor([], options, new TestAdapter() as any);
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
   * @param GeneratorOrNamespace - Generator constructor or namespace
   */

  run(
    GeneratorOrNamespace: string | GeneratorConstructor,
    settings?: RunContextSettings,
    envOptions?: Options,
  ): RunContext {
    const contextSettings = _.cloneDeep(this.settings ?? {});
    const generatorOptions = _.cloneDeep(this.generatorOptions ?? {});
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

  create(
    GeneratorOrNamespace: string | GeneratorConstructor,
    settings: RunContextSettings,
    envOptions: Options,
  ) {
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
