/* eslint-disable max-params */
import {mkdirSync, existsSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import _ from 'lodash';
import {spy as sinonSpy, stub as sinonStub} from 'sinon';
import YeomanGenerator from 'yeoman-generator';
import Environment from 'yeoman-environment';
import type {GeneratorOptions} from 'yeoman-generator';
import type {Options, createEnv} from 'yeoman-environment';
import type {SinonSpiedInstance} from 'sinon';

import {DummyPrompt, type DummyPromptOptions, TestAdapter} from './adapter.js';
import RunContext from './run-context.js';
import testContext from './test-context.js';
import type {RunContextSettings} from './run-context.js';

/**
 * Dependencies can be path (autodiscovery) or an array [<generator>, <name>]
 */
export type Dependency = string | Parameters<Environment['registerStub']>;

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
   * @deprecated
   * Create a function that will clean up the test directory,
   * cd into it. Intended for use
   * as a callback for the mocha `before` hook.
   *
   * @param dir - path to the test directory
   * @returns mocha callback
   */

  setUpTestDirectory(dir: string): () => void {
    return () => {
      this.testDirectory(dir);
    };
  }

  /**
   * @deprecated
   * Clean-up the test directory and cd into it.
   * Call given callback after entering the test directory.
   * @param dir - path to the test directory
   * @param cb - callback executed after setting working directory to dir
   * @example
   * testDirectory(path.join(__dirname, './temp'), function () {
   *   fs.writeFileSync('testfile', 'Roses are red.');
   * });
   */

  testDirectory(dir: string, cb?: (error?) => unknown) {
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
   * @deprecated
   * Answer prompt questions for the passed-in generator
   * @param generator - a Yeoman generator or environment
   * @param answers - an object where keys are the
   *   generators prompt names and values are the answers to
   *   the prompt questions
   * @param options - Options or callback
   * @example
   * mockPrompt(angular, {'bootstrap': 'Y', 'compassBoostrap': 'Y'});
   */

  mockPrompt(
    envOrGenerator: YeomanGenerator | Environment,
    mockedAnswers?: YeomanGenerator.Answers,
    options?: DummyPromptOptions,
  ) {
    const environment =
      'env' in envOrGenerator ? envOrGenerator.env : envOrGenerator;
    const {promptModule} = environment.adapter;

    for (const name of Object.keys(promptModule.prompts)) {
      promptModule.registerPrompt(
        name,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question, rl, answers) {
            super(question, rl, answers, mockedAnswers, options);
          }
        } as any,
      );
    }
  }

  /**
   * @deprecated
   * Restore defaults prompts on a generator.
   * @param generator or environment
   */
  restorePrompt(envOrGenerator: YeomanGenerator | Environment) {
    const environment: Environment =
      (envOrGenerator as any).env ?? envOrGenerator;
    environment.adapter.promptModule.restoreDefaultPrompts();
  }

  /**
   * @deprecated
   * Provide mocked values to the config
   * @param generator - a Yeoman generator
   * @param localConfig - localConfig - should look just like if called config.getAll()
   */
  mockLocalConfig(generator: YeomanGenerator, localConfig) {
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
   * @param name - the name of the generator
   * @param dependencies - paths to the generators dependencies
   * @param args - arguments to the generator;
   *   if String, will be split on spaces to create an Array
   * @param options - configuration for the generator
   * @param localConfigOnly - passes localConfigOnly to the generators
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
   * @deprecated
   * Register a list of dependent generators into the provided env.
   * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
   *
   * @param dependencies - paths to the generators dependencies
   */

  registerDependencies(env: Environment, dependencies: Dependency[]) {
    for (const dependency of dependencies) {
      if (Array.isArray(dependency)) {
        env.registerStub(dependency[0] as any, dependency[1]);
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

  run<GeneratorType extends YeomanGenerator = YeomanGenerator>(
    GeneratorOrNamespace: string | GeneratorConstructor,
    settings?: RunContextSettings,
    envOptions?: Options,
  ): RunContext<GeneratorType> {
    const contextSettings = _.cloneDeep(this.settings ?? {});
    const generatorOptions = _.cloneDeep(this.generatorOptions ?? {});
    const RunContext = this.getRunContextType();
    const runContext = new RunContext<GeneratorType>(
      GeneratorOrNamespace,
      {...contextSettings, ...settings},
      envOptions,
      this,
    ).withOptions(generatorOptions);
    if (settings?.autoCleanup !== false) {
      testContext.startNewContext(runContext);
    }

    return runContext;
  }

  /**
   * Prepare a run context
   * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
   * @return {RunContext}
   */

  create<GeneratorType extends YeomanGenerator = YeomanGenerator>(
    GeneratorOrNamespace: string | GeneratorConstructor,
    settings?: RunContextSettings,
    envOptions?: Options,
  ) {
    return this.run<GeneratorType>(GeneratorOrNamespace, settings, envOptions);
  }
}

export default new YeomanTest();

export const createHelpers = (options) => {
  const helpers = new YeomanTest();
  Object.assign(helpers, options);
  return helpers;
};
