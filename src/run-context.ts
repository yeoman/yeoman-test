import crypto from 'node:crypto';
import {existsSync, rmSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import process from 'node:process';
import _ from 'lodash';
import tempDirectory from 'temp-dir';
import type Generator from 'yeoman-generator';
import type Environment from 'yeoman-environment';
import {type LookupOptions, type Options} from 'yeoman-environment';

import RunResult, {type RunResultOptions} from './run-result.js';
import defaultHelpers, {
  type GeneratorConstructor,
  type Dependency,
  type YeomanTest,
} from './helpers.js';

/**
 * Provides settings for creating a `RunContext`.
 */
export type RunContextSettings = {
  /**
   * Automatically run this generator in a tmp dir
   * @default true
   */
  tmpdir?: boolean;

  cwd?: string;

  oldCwd?: string;

  forwardCwd?: boolean;

  autoCleanup?: boolean;

  /**
   * File path to the generator (only used if Generator is a constructor)
   */
  resolved?: string;

  runEnvironment?: boolean;

  /**
   * Namespace (only used if Generator is a constructor)
   * @default 'gen:test'
   */
  namespace?: string;
};

type PromiseRunResult = Promise<RunResult>;

export class RunContextBase extends EventEmitter {
  readonly mockedGenerators: Record<string, Generator> = {};
  env!: Environment;
  generator!: Generator;
  readonly settings: RunContextSettings;
  readonly envOptions: Environment.Options;
  completed = false;

  protected environmentPromise?: PromiseRunResult;

  private args: string[] = [];
  private options: any = {};
  private answers: any = {};

  private localConfig: any = null;
  private dependencies: any[] = [];
  private readonly inDirCallbacks: any[] = [];
  private lookups: LookupOptions[] = [];
  private readonly Generator: string | GeneratorConstructor | typeof Generator;
  private oldCwd?: string;
  private readonly helpers: YeomanTest;
  private eventListenersSet = false;
  private targetDirectory?: string;
  private envCB: any;
  private promptOptions: any;

  private ran = false;
  private errored = false;

  private generatorPromise?: Promise<Generator>;
  private readonly temporaryDir = path.join(
    tempDirectory,
    crypto.randomBytes(20).toString('hex'),
  );

  /**
   * This class provide a run context object to façade the complexity involved in setting
   * up a generator for testing
   * @constructor
   * @param Generator - Namespace or generator constructor. If the later
   *                                       is provided, then namespace is assumed to be
   *                                       'gen:test' in all cases
   * @param settings
   * @return {this}
   */

  constructor(
    generatorType: string | GeneratorConstructor | typeof Generator,
    settings?: RunContextSettings,
    envOptions: Options = {},
    helpers = defaultHelpers,
  ) {
    super();
    this.Generator = generatorType;
    this.settings = {
      namespace: 'gen:test',
      runEnvironment: false,
      ...settings,
    };
    this.envOptions = envOptions;

    this.withOptions({
      force: true,
      skipCache: true,
      skipInstall: true,
    });
    this.oldCwd = this.settings.oldCwd;
    if (this.settings.cwd) {
      this.cd(this.settings.cwd);
    }

    this.helpers = helpers;
  }

  /**
   * Run the generator on the environment and promises a RunResult instance.
   * @return {PromiseRunResult} Promise a RunResult instance.
   */
  async run(): PromiseRunResult {
    if (!this.ran) {
      await this.build();
    }

    this.environmentPromise = this.generatorPromise!.then(async (generator) =>
      this.env
        .runGenerator(generator as any)
        .then(() => new RunResult(this._createRunResultOptions()))
        .finally(() => {
          this.helpers.restorePrompt(this.env);
          this.completed = true;
        }),
    );
    return this.environmentPromise;
  }

  // If any event listeners is added, setup event listeners emitters
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    super.on(eventName, listener);
    // Don't setup emitters if on generator envent.
    if (eventName !== 'generator') {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.setupEventListeners();
    }

    return this;
  }

  /**
   * @deprecated
   * Clean the provided directory, then change directory into it
   * @param  dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @param [cb] - callback who'll receive the folder path as argument
   * @return run context instance
   */
  inDir(dirPath: string, cb?: (folderPath: string) => void): this {
    this.setDir(dirPath, true);
    this.helpers.testDirectory(dirPath, () =>
      cb?.call(this, path.resolve(dirPath)),
    );
    return this;
  }

  /**
   * Register an callback to prepare the destination folder.
   * @param [cb]  - callback who'll receive the folder path as argument
   * @return this - run context instance
   */
  doInDir(cb: (folderPath: string) => void): this {
    this.inDirCallbacks.push(cb);
    return this;
  }

  /**
   * @deprecated
   * Change directory without deleting directory content.
   * @param  dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @return run context instance
   */
  cd(dirPath: string): this {
    dirPath = path.resolve(dirPath);
    this.setDir(dirPath, false);
    try {
      process.chdir(dirPath);
    } catch (error: any) {
      this.completed = true;
      throw new Error(`${error.message} ${dirPath}`);
    }

    return this;
  }

  /**
   * Cleanup a temporary directory and change the CWD into it
   *
   * This method is called automatically when creating a RunContext. Only use it if you need
   * to use the callback.
   *
   * @param [cb]  - callback who'll receive the folder path as argument
   * @return this - run context instance
   */
  inTmpDir(cb?: (folderPath: string) => void): this {
    return this.inDir(this.temporaryDir, cb);
  }

  /**
   * Restore cwd to initial cwd.
   * @return {this} run context instance
   */

  restore() {
    if (this.oldCwd) {
      process.chdir(this.oldCwd);
    }

    return this;
  }

  /**
   * Clean the directory used for tests inside inDir/inTmpDir
   * @param  {Boolean} force - force directory cleanup for not tmpdir
   */
  cleanup() {
    this.restore();
    if (this.settings.tmpdir !== false) {
      this.cleanTestDirectory();
    }
  }

  /**
   * Clean the directory used for tests inside inDir/inTmpDir
   * @param  {Boolean} force - force directory cleanup for not tmpdir
   */
  cleanupTemporaryDir() {
    this.restore();
    console.log(this.temporaryDir);
    if (this.temporaryDir && existsSync(this.temporaryDir)) {
      // RmSync(this.temporaryDir, {recursive: true});
    }
  }

  /**
   * Clean the directory used for tests inside inDir/inTmpDir
   * @param force - force directory cleanup for not tmpdir
   */
  cleanTestDirectory(force = false) {
    if (!force && this.settings.tmpdir === false) {
      throw new Error('Cleanup test dir called with false tmpdir option.');
    }

    if (this.targetDirectory && existsSync(this.targetDirectory)) {
      rmSync(this.targetDirectory, {recursive: true});
    }
  }

  /**
   * Create an environment
   *
   * This method is called automatically when creating a RunContext. Only use it if you need
   * to use the callback.
   *
   * @param {Function} [cb] - callback who'll receive the folder path as argument
   * @return {this} run context instance
   */
  withEnvironment(cb) {
    this.envCB = cb;
    return this;
  }

  /**
   * Run lookup on the environment.
   *
   * @param lookups - lookup to run.
   */
  withLookups(lookups: LookupOptions | LookupOptions[]): this {
    this.lookups = this.lookups.concat(lookups);
    return this;
  }

  /**
   * Provide arguments to the run context
   * @param  args - command line arguments as Array or space separated string
   */
  withArguments(args: string | string[]): this {
    const argsArray = typeof args === 'string' ? args.split(' ') : args;
    assert(
      Array.isArray(argsArray),
      'args should be either a string separated by spaces or an array',
    );
    this.args = this.args.concat(argsArray);
    return this;
  }

  /**
   * Provide options to the run context
   * @param  {Object} options - command line options (e.g. `--opt-one=foo`)
   * @return {this}
   */

  withOptions(options: any): this {
    if (!options) {
      return this;
    }

    // Add options as both kebab and camel case. This is to stay backward compatibles with
    // the switch we made to meow for options parsing.
    for (const key of Object.keys(options)) {
      options[_.camelCase(key)] = options[key];
      options[_.kebabCase(key)] = options[key];
    }

    this.options = {...this.options, ...options};
    return this;
  }

  /**
   * Mock the prompt with dummy answers
   * @param  {Object} answers - Answers to the prompt questions
   * @param  {Object|Function}   [options] - Options or callback.
   * @param  {Function} [options.callback] - Callback.
   * @param  {Boolean} [options.throwOnMissingAnswer] - Throw if a answer is missing.
   * @return {this}
   */

  withPrompts(answers: Generator.Answers, options) {
    this.answers = {...this.answers, ...answers};
    this.promptOptions = options;
    return this;
  }

  /**
   * Provide dependent generators
   * @param {Array} dependencies - paths to the generators dependencies
   * @return {this}
   * @example
   * var angular = new RunContext('../../app');
   * angular.withGenerators([
   *   '../../common',
   *   '../../controller',
   *   '../../main',
   *   [helpers.createDummyGenerator(), 'testacular:app']
   * ]);
   * angular.on('end', function () {
   *   // assert something
   * });
   */

  withGenerators(dependencies: Dependency[]): this {
    assert(Array.isArray(dependencies), 'dependencies should be an array');
    this.dependencies = this.dependencies.concat(dependencies);
    return this;
  }

  /**
   * Create mocked generators
   * @param namespaces - namespaces of mocked generators
   * @return this
   * @example
   * var angular = helpers
   *   .create('../../app')
   *   .withMockedGenerators([
   *     'foo:app',
   *     'foo:bar',
   *   ])
   *   .run()
   *   .then(runResult => assert(runResult
   *     .mockedGenerators['foo:app']
 .calledOnce));
   */

  withMockedGenerators(namespaces: string[]): this {
    assert(Array.isArray(namespaces), 'namespaces should be an array');
    const entries = namespaces.map((namespace) => [
      namespace,
      this.helpers.createMockedGenerator(),
    ]);
    Object.assign(this.mockedGenerators, Object.fromEntries(entries));
    const dependencies = entries.map(([namespace, generator]) => [
      generator,
      namespace,
    ]);
    this.dependencies = this.dependencies.concat(dependencies);
    return this;
  }

  /**
   * Mock the local configuration with the provided config
   * @param localConfig - should look just like if called config.getAll()
   */
  withLocalConfig(localConfig: Record<string, unknown>): this {
    assert(typeof localConfig === 'object', 'config should be an object');
    this.localConfig = localConfig;
    return this;
  }

  /**
   * Build the generator and the environment.
   * @return {RunContext|false} this
   */
  protected async build(callback?: (context: any) => any): Promise<void> {
    if (this.ran || this.completed) {
      throw new Error('The context is already built');
    }

    this.ran = true;

    if (!this.targetDirectory && this.settings.tmpdir !== false) {
      this.inTmpDir();
    } else if (!this.targetDirectory) {
      throw new Error('If not a temporary dir, pass the test cwd');
    }

    if (this.inDirCallbacks.length > 0) {
      const targetDirectory = path.resolve(this.targetDirectory!);
      for (const cb of this.inDirCallbacks) {
        // eslint-disable-next-line no-await-in-loop
        await cb(targetDirectory);
      }
    }

    this.targetDirectory = this.targetDirectory ?? process.cwd();

    const testEnv = this.helpers.createTestEnv(this.envOptions.createEnv, {
      cwd: this.settings.forwardCwd ? this.targetDirectory : undefined,
      ...this.options,
      ...this.envOptions,
    });
    this.env = this.envCB ? (await this.envCB(testEnv)) ?? testEnv : testEnv;

    for (const lookup of this.lookups) {
      this.env.lookup(lookup);
    }

    this.helpers.registerDependencies(this.env, this.dependencies);

    let namespace;
    if (typeof this.Generator === 'string') {
      if (this.settings.runEnvironment) {
        namespace = this.Generator;
      } else {
        namespace = this.env.namespace(this.Generator);
        if (namespace !== this.Generator) {
          // Generator is a file path, it should be registered.
          this.env.register(this.Generator);
        }
      }
    } else {
      namespace = this.settings.namespace;
      this.env.registerStub(
        this.Generator as any,
        namespace,
        this.settings.resolved,
      );
    }

    this.generatorPromise = Promise.resolve(
      this.env.create(namespace, this.args, this.options) as any,
    );

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.generatorPromise.then((generator) => {
      this.generator = generator;
      this.emit('generator', generator);
    });

    this.helpers.mockPrompt(this.env, this.answers, this.promptOptions);

    if (this.localConfig) {
      // Only mock local config when withLocalConfig was called
      this.generatorPromise = this.generatorPromise.then((generator) => {
        this.helpers.mockLocalConfig(generator, this.localConfig);
        return generator;
      });
    }

    callback?.(this);
  }

  /**
   * Return a promise representing the generator run process
   * @return Promise resolved on end or rejected on error
   */
  protected async toPromise(): PromiseRunResult {
    return this.environmentPromise ?? this.run();
  }

  /**
   * Keeps compatibility with events
   */

  private setupEventListeners(): Promise<void | RunResult> | undefined {
    if (this.eventListenersSet) {
      return undefined;
    }

    this.eventListenersSet = true;

    return this.build().then(async () =>
      this.generatorPromise!.then((generator) => {
        this.emit('ready', generator);
        this.run()
          .catch((error) => {
            if (
              this.listenerCount('end') === 0 &&
              this.listenerCount('error') === 0
            ) {
              // When there is no listeners throw a unhandled rejection.
              setImmediate(async function () {
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                throw error;
              });
            } else {
              this.errored = true;
              this.emit('error', error);
            }
          })
          .finally(() => {
            this.emit('end');
          });
      }),
    );
  }

  /**
   * Set the target directory.
   * @private
   * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @return {this} run context instance
   */
  private setDir(dirPath, tmpdir) {
    if (this.targetDirectory) {
      this.completed = true;
      throw new Error('Test directory has already been set.');
    }

    if (tmpdir !== undefined) {
      this.settings.tmpdir = tmpdir;
    }

    this.oldCwd = this.oldCwd ?? process.cwd();

    this.targetDirectory = dirPath;
    return this;
  }

  private _createRunResultOptions(): RunResultOptions {
    return {
      env: this.env,
      generator: this.generator,
      memFs: this.env.sharedFs,
      settings: {
        ...this.settings,
      },
      oldCwd: this.oldCwd!,
      cwd: this.targetDirectory!,
      envOptions: this.envOptions,
      mockedGenerators: this.mockedGenerators,
      helpers: this.helpers,
    };
  }
}

export default class RunContext extends RunContextBase {
  // eslint-disable-next-line unicorn/no-thenable
  async then(
    onfulfilled?: Parameters<PromiseRunResult['then']>[0],
    onrejected?: Parameters<PromiseRunResult['then']>[1],
  ): ReturnType<PromiseRunResult['then']> {
    return this.toPromise().then(onfulfilled, onrejected);
  }

  async catch(
    onrejected?: Parameters<PromiseRunResult['catch']>[0],
  ): ReturnType<PromiseRunResult['catch']> {
    return this.toPromise().catch(onrejected);
  }

  async finally(
    onfinally?: Parameters<PromiseRunResult['finally']>[0],
  ): ReturnType<PromiseRunResult['finally']> {
    return this.toPromise().finally(onfinally);
  }
}
