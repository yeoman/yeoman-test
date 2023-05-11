/* eslint-disable max-params */
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import _ from 'lodash';
import { spy as sinonSpy, stub as sinonStub } from 'sinon';
import type {
  BaseEnvironmentOptions,
  BaseGenerator,
  GeneratorBaseOptions,
  GetGeneratorConstructor,
  GetGeneratorOptions,
  PromptAnswers,
  PromptQuestion,
} from '@yeoman/types';
import type { SinonSpiedInstance } from 'sinon';
import { DummyPrompt, type DummyPromptOptions, TestAdapter } from './adapter.js';
import RunContext, { BasicRunContext, type RunContextSettings } from './run-context.js';
import testContext from './test-context.js';
import type { DefaultEnvironmentApi, DefaultGeneratorApi } from './type-helpers.js';

const { cloneDeep } = _;

/**
 * Dependencies can be path (autodiscovery) or an array [<generator>, <name>]
 */
export type Dependency = string | Parameters<DefaultEnvironmentApi['registerStub']>;

export type GeneratorFactory<GenParameter extends BaseGenerator = DefaultGeneratorApi> =
  | GetGeneratorConstructor<GenParameter>
  | ((...args: ConstructorParameters<GetGeneratorConstructor<GenParameter>>) => GenParameter);

/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @class YeomanTest
 */

export class YeomanTest {
  settings?: RunContextSettings;
  environmentOptions?: BaseEnvironmentOptions;
  generatorOptions?: GeneratorBaseOptions;

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

  testDirectory(dir: string, cb?: (error?: any) => unknown) {
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

  mockPrompt(envOrGenerator: BaseGenerator | DefaultEnvironmentApi, mockedAnswers?: PromptAnswers, options?: DummyPromptOptions) {
    const environment = 'env' in envOrGenerator ? envOrGenerator.env : envOrGenerator;
    if (!environment.adapter) {
      throw new Error('environment is not an Environment instance');
    }

    const { promptModule } = environment.adapter as TestAdapter;

    for (const name of Object.keys(promptModule.prompts)) {
      promptModule.registerPrompt(
        name,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question: PromptQuestion, rl: any, answers: PromptAnswers) {
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
  restorePrompt(envOrGenerator: BaseGenerator | DefaultEnvironmentApi) {
    const environment: DefaultEnvironmentApi = (envOrGenerator as any).env ?? envOrGenerator;
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
  async createMockedGenerator(GeneratorClass): Promise<SinonSpiedInstance<DefaultGeneratorApi>> {
    if (!GeneratorClass) {
      const GeneratorImplementation = await import('yeoman-generator');
      GeneratorClass = (GeneratorImplementation.default ?? GeneratorImplementation) as any;
    }

    class MockedGenerator extends GeneratorClass {}
    const generator = sinonSpy(MockedGenerator);
    for (const methodName of ['run', 'queueTasks', 'runWithOptions', 'queueOwnTasks']) {
      Object.defineProperty(MockedGenerator.prototype, methodName, {
        value: sinonStub(),
      });
    }

    return generator as any;
  }

  /**
   * Create a simple, dummy generator
   */
  async createDummyGenerator<GenParameter extends BaseGenerator = DefaultGeneratorApi>(
    Generator?: GetGeneratorConstructor<GenParameter>,
    contents: Record<string, (...args: any[]) => void> = {
      test(this: any) {
        this.shouldRun = true;
      },
    },
  ): Promise<new (...args: any[]) => GenParameter> {
    if (!Generator) {
      const GeneratorImplementation = await import('yeoman-generator');
      Generator = (GeneratorImplementation.default ?? GeneratorImplementation) as any;
    }

    const GeneratorConstructor: GetGeneratorConstructor<GenParameter> = Generator as any;
    class DummyGenerator extends GeneratorConstructor {
      constructor(...args: any[]) {
        const optIndex = Array.isArray(args[0]) ? 1 : 0;
        args[optIndex] = args[optIndex] ?? {};
        const options = args[optIndex];
        options.namespace = options.namespace ?? 'dummy';
        options.resolved = options.resolved ?? 'dummy';

        super(...args);
      }
    }

    for (const [propName, propValue] of Object.entries(contents)) {
      Object.defineProperty(DummyGenerator.prototype, propName, {
        value: propValue ?? Object.create(null),
        writable: true,
      });
    }

    return DummyGenerator as any;
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
    name: string,
    dependencies: Dependency[],
    args?: string[],
    options?: GetGeneratorOptions<GeneratorType>,
    localConfigOnly = true,
  ): Promise<GeneratorType> {
    const env = await this.createEnv([], { sharedOptions: { localConfigOnly } });
    this.registerDependencies(env, dependencies);
    return env.create(name, args as any, options as any) as unknown as GeneratorType;
  }

  /**
   * @deprecated
   * Register a list of dependent generators into the provided env.
   * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
   *
   * @param dependencies - paths to the generators dependencies
   */

  registerDependencies(env: DefaultEnvironmentApi, dependencies: Dependency[]) {
    for (const dependency of dependencies) {
      if (Array.isArray(dependency)) {
        if (typeof dependency[0] === 'string') {
          (env as any).register(...dependency);
        } else {
          (env as any).registerStub(...dependency);
        }
      } else {
        (env as any).register(dependency);
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

  async createEnv(...args: any[]): Promise<DefaultEnvironmentApi> {
    const dynamicEnv = await import('yeoman-environment');
    const createEnv = dynamicEnv.createEnv ?? dynamicEnv.default.createEnv;
    return createEnv(...args);
  }

  /**
   * Creates a test environment.
   *
   * @param {Function} - environment constructor method.
   * @param {Object} - Options to be passed to the environment
   * const env = createTestEnv(require('yeoman-environment').createEnv);
   */

  async createTestEnv(envContructor = this.createEnv, options: BaseEnvironmentOptions = { localConfigOnly: true }) {
    let envOptions = cloneDeep(this.environmentOptions ?? {});
    if (typeof options === 'boolean') {
      envOptions = {
        newErrorHandler: true,
        ...envOptions,
        sharedOptions: {
          localConfigOnly: options,
          ...envOptions.sharedOptions,
        },
      };
    } else {
      envOptions.sharedOptions = {
        localConfigOnly: true,
        ...envOptions.sharedOptions,
        ...options.sharedOptions,
      };
      envOptions = {
        newErrorHandler: true,
        ...envOptions,
        ...options,
      };
    }

    return envContructor([], envOptions, new TestAdapter() as any);
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
    GeneratorOrNamespace: string | GeneratorFactory<GeneratorType>,
    settings?: RunContextSettings,
    envOptions?: BaseEnvironmentOptions,
  ): RunContext<GeneratorType> {
    const contextSettings = cloneDeep(this.settings ?? {});
    const generatorOptions = cloneDeep(this.generatorOptions ?? {});
    const RunContext = this.getRunContextType();
    const runContext = new RunContext<GeneratorType>(
      GeneratorOrNamespace,
      { ...contextSettings, ...settings },
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

  create<GeneratorType extends BaseGenerator = DefaultGeneratorApi>(
    GeneratorOrNamespace: string | GeneratorFactory<GeneratorType>,
    settings?: RunContextSettings,
    envOptions?: BaseEnvironmentOptions,
  ) {
    return this.run<GeneratorType>(GeneratorOrNamespace, settings, envOptions);
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
