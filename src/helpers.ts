import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { mock } from 'node:test';
import { cloneDeep } from 'lodash-es';
import type {
  BaseEnvironment,
  BaseEnvironmentOptions,
  BaseGenerator,
  BaseGeneratorConstructor,
  BaseGeneratorOptions,
  GetGeneratorConstructor,
  InstantiateOptions,
  PromptAnswers,
} from '@yeoman/types';
import type { DefaultEnvironmentApi, DefaultGeneratorApi } from '../types/type-helpers.js';
import { type DummyPromptOptions, TestAdapter, type TestAdapterOptions } from './adapter.js';
import RunContext, { BasicRunContext, type RunContextSettings } from './run-context.js';
import testContext from './test-context.js';
import { createEnv as createEnvironment } from './default-environment.js';

let dummyParentClass;
export const setDefaultDummyParentClass = (parentClass: any) => {
  dummyParentClass = parentClass;
};

const getDummyParentClass = (): BaseGeneratorConstructor => {
  dummyParentClass ??= createRequire(import.meta.url)('yeoman-generator').default;
  return dummyParentClass;
};

export type CreateEnv = (options: BaseEnvironmentOptions) => Promise<BaseEnvironment>;

/**
 * Dependencies can be path (autodiscovery) or an array [<generator>, <name>]
 */
export type Dependency = string | Parameters<DefaultEnvironmentApi['register']>;

/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @class YeomanTest
 */

export class YeomanTest {
  settings?: RunContextSettings;
  environmentOptions?: BaseEnvironmentOptions;
  generatorOptions?: BaseGeneratorOptions;
  adapterOptions?: Omit<TestAdapterOptions, 'mockedAnswers'>;

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

  testDirectory(dir: string, callback?: (error?: any) => unknown) {
    if (!dir) {
      throw new Error('Missing directory');
    }

    dir = resolve(dir);

    // Make sure we're not deleting CWD by moving to top level folder. As we `cd` in the
    // test dir after cleaning up, this shouldn't be perceivable.
    process.chdir('/');

    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }

      mkdirSync(dir, { recursive: true });
      process.chdir(dir);
      return callback?.();
    } catch (error) {
      return callback?.(error);
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

  mockPrompt(environmentOrGenerator: BaseGenerator | DefaultEnvironmentApi, mockedAnswers?: PromptAnswers, options?: DummyPromptOptions) {
    const environment = 'env' in environmentOrGenerator ? environmentOrGenerator.env : environmentOrGenerator;
    if (!environment.adapter) {
      throw new Error('environment is not an Environment instance');
    }

    const testAdapter = environment.adapter as TestAdapter;
    const { promptModule } = testAdapter;

    for (const name of Object.keys(promptModule.prompts)) {
      testAdapter.registerDummyPrompt(name, { ...options, mockedAnswers });
    }
  }

  /**
   * @deprecated
   * Restore defaults prompts on a generator.
   * @param generator or environment
   */
  restorePrompt(environmentOrGenerator: BaseGenerator | DefaultEnvironmentApi) {
    const environment: DefaultEnvironmentApi = (environmentOrGenerator as BaseGenerator).env ?? environmentOrGenerator;
    environment.adapter.close();
  }

  /**
   * @deprecated
   * Provide mocked values to the config
   * @param generator - a Yeoman generator
   * @param localConfig - localConfig - should look just like if called config.getAll()
   */
  mockLocalConfig(generator: BaseGenerator, localConfig: any) {
    (generator as any).config.defaults(localConfig);
  }

  /**
   * Create a mocked generator
   */
  createMockedGenerator(GeneratorClass = getDummyParentClass()): ReturnType<typeof mock.fn> {
    class MockedGenerator extends GeneratorClass {}
    const generator = mock.fn(MockedGenerator);
    for (const methodName of ['run', 'queueTasks', 'runWithOptions', 'queueOwnTasks']) {
      Object.defineProperty(MockedGenerator.prototype, methodName, {
        value: mock.fn(),
      });
    }

    return generator as any;
  }

  /**
   * Create a simple, dummy generator
   */
  createDummyGenerator<const GenParameter extends new (...args: any[]) => BaseGenerator = BaseGeneratorConstructor>(
    Generator: GenParameter = getDummyParentClass() as GenParameter,
    contents: Record<string, (...arguments_: any[]) => void> = {
      test(this: any) {
        this.shouldRun = true;
      },
    },
  ): GenParameter {
    class DummyGenerator extends Generator {
      constructor(...arguments_: any[]) {
        const optIndex = Array.isArray(arguments_[0]) ? 1 : 0;
        arguments_[optIndex] = arguments_[optIndex] ?? {};
        const options = arguments_[optIndex];
        options.namespace = options.namespace ?? 'dummy';
        options.resolved = options.resolved ?? 'dummy';

        super(...arguments_);
      }
    }

    for (const [propertyName, propertyValue] of Object.entries(contents)) {
      Object.defineProperty(DummyGenerator.prototype, propertyName, {
        value: propertyValue ?? Object.create(null),
        writable: true,
      });
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
  async createGenerator<GeneratorType extends BaseGenerator = DefaultGeneratorApi>(
    name: string | GetGeneratorConstructor<GeneratorType>,
    options: {
      dependencies?: Dependency[];
      localConfigOnly?: boolean;
    } & InstantiateOptions<GeneratorType> = {},
  ): Promise<GeneratorType> {
    const { dependencies = [], localConfigOnly = true, ...instantiateOptions } = options;
    const environment = await this.createEnv({ sharedOptions: { localConfigOnly } });
    for (const dependency of dependencies) {
      if (typeof dependency === 'string') {
        environment.register(dependency);
      } else {
        environment.register(...dependency);
      }
    }

    return environment.create<GeneratorType>(name, instantiateOptions);
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

  async createEnv(options: BaseEnvironmentOptions): Promise<DefaultEnvironmentApi> {
    return createEnvironment(options);
  }

  /**
   * Creates a test environment.
   *
   * @param {Function} - environment constructor method.
   * @param {Object} - Options to be passed to the environment
   * const env = createTestEnv(require('yeoman-environment').createEnv);
   */

  async createTestEnv(environmentContructor: CreateEnv = this.createEnv, options: BaseEnvironmentOptions = { localConfigOnly: true }) {
    let environmentOptions = cloneDeep(this.environmentOptions ?? {});
    if (typeof options === 'boolean') {
      environmentOptions = {
        newErrorHandler: true,
        ...environmentOptions,
        sharedOptions: {
          localConfigOnly: options,
          ...environmentOptions.sharedOptions,
        },
      } as any;
    } else {
      environmentOptions.sharedOptions = {
        localConfigOnly: true,
        ...environmentOptions.sharedOptions,
        ...options.sharedOptions,
      };
      environmentOptions = {
        newErrorHandler: true,
        ...environmentOptions,
        ...options,
      } as any;
    }

    return environmentContructor({ adapter: this.createTestAdapter(), ...environmentOptions });
  }

  /**
   * Creates a TestAdapter using helpers default options.
   */
  createTestAdapter(options?: TestAdapterOptions) {
    return new TestAdapter({ ...this.adapterOptions, ...options });
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

  run<GeneratorType extends BaseGenerator = DefaultGeneratorApi>(
    GeneratorOrNamespace: string | GetGeneratorConstructor<GeneratorType>,
    settings?: RunContextSettings,
    environmentOptions?: BaseEnvironmentOptions,
  ): RunContext<GeneratorType> {
    const contextSettings = cloneDeep(this.settings ?? {});
    const generatorOptions = cloneDeep(this.generatorOptions ?? {});
    const RunContext = this.getRunContextType();
    const runContext = new RunContext<GeneratorType>(
      GeneratorOrNamespace,
      { ...contextSettings, ...settings },
      environmentOptions,
      this,
    ).withOptions(generatorOptions as any);
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

  create<GeneratorType extends BaseGenerator = DefaultGeneratorApi>(
    GeneratorOrNamespace: string | GetGeneratorConstructor<GeneratorType>,
    settings?: RunContextSettings,
    environmentOptions?: BaseEnvironmentOptions,
  ) {
    return this.run<GeneratorType>(GeneratorOrNamespace, settings, environmentOptions);
  }

  /**
   * Prepare temporary dir without generator support.
   * Generator and environment will be undefined.
   */
  prepareTemporaryDir(settings?: RunContextSettings) {
    const context = new BasicRunContext(undefined, settings);
    if (settings?.autoCleanup !== false) {
      testContext.startNewContext(context);
    }

    return context;
  }
}

const defaultHelpers = new YeomanTest();

export default defaultHelpers;

export const createHelpers = (options: any) => {
  const helpers = new YeomanTest();
  Object.assign(helpers, options);
  return helpers;
};
