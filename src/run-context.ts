import crypto from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import path, { resolve, isAbsolute, join as pathJoin } from 'node:path';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import _ from 'lodash';
import tempDirectory from 'temp-dir';
import type Generator from 'yeoman-generator';
import type Environment from 'yeoman-environment';
import { type LookupOptions, type Options } from 'yeoman-environment';
import { create as createMemFsEditor, type MemFsEditor, type VinylMemFsEditorFile } from 'mem-fs-editor';
// eslint-disable-next-line n/file-extension-in-import
import { resetFileCommitStates } from 'mem-fs-editor/state';
import { create as createMemFs, type Store } from 'mem-fs';

import RunResult, { type RunResultOptions } from './run-result.js';
import defaultHelpers, { type GeneratorConstructor, type Dependency, type YeomanTest } from './helpers.js';
import { type DummyPromptOptions } from './adapter.js';
import testContext from './test-context.js';

const { camelCase, kebabCase, merge: lodashMerge, set: lodashSet } = _;

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

  memFs?: Store;

  /**
   * File path to the generator (only used if Generator is a constructor)
   */
  resolved?: string;

  /**
   * Namespace (only used if Generator is a constructor)
   * @default 'gen:test'
   */
  namespace?: string;
};

type PromiseRunResult<GeneratorType extends Generator> = Promise<RunResult<GeneratorType>>;
type MockedGeneratorFactory = (GeneratorClass?: typeof Generator) => typeof Generator;

export class RunContextBase<GeneratorType extends Generator = Generator> extends EventEmitter {
  readonly mockedGenerators: Record<string, Generator> = {};
  env!: Environment;
  generator!: GeneratorType;
  readonly settings: RunContextSettings;
  readonly envOptions: Environment.Options;
  completed = false;
  targetDirectory?: string;
  editor!: MemFsEditor;
  memFs: Store<VinylMemFsEditorFile>;
  mockedGeneratorFactory: MockedGeneratorFactory;

  protected environmentPromise?: PromiseRunResult<GeneratorType>;

  private args: string[] = [];
  private options: any = {};
  private answers?: any;
  private keepFsState?: boolean;

  private readonly onGeneratorCallbacks: Array<(this: this, generator: GeneratorType) => any> = [];

  private readonly onTargetDirectoryCallbacks: Array<(this: this, targetDirectory: string) => any> = [];

  private readonly onEnvironmentCallbacks: Array<(this: this, env: Environment) => any> = [];

  private readonly inDirCallbacks: any[] = [];
  private readonly Generator?: string | GeneratorConstructor<GeneratorType> | typeof Generator;
  private readonly helpers: YeomanTest;
  private readonly temporaryDir = path.join(tempDirectory, crypto.randomBytes(20).toString('hex'));

  private oldCwd?: string;
  private eventListenersSet = false;
  private envCB: any;

  private built = false;
  private ran = false;
  private errored = false;

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
    generatorType?: string | GeneratorConstructor<GeneratorType> | typeof Generator,
    settings?: RunContextSettings,
    envOptions: Options = {},
    helpers = defaultHelpers,
  ) {
    super();
    this.settings = {
      ...settings,
    };
    this.Generator = generatorType;

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
    this.memFs = (settings?.memFs as Store<VinylMemFsEditorFile>) ?? createMemFs();
    this.mockedGeneratorFactory = this.helpers.createMockedGenerator as any;
  }

  /**
   * Run the generator on the environment and promises a RunResult instance.
   * @return {PromiseRunResult} Promise a RunResult instance.
   */
  async run(): PromiseRunResult<GeneratorType> {
    this.ran = true;

    if (!this.built) {
      await this.build();
    }

    try {
      await this.env.runGenerator(this.generator as any);
    } finally {
      this.helpers.restorePrompt(this.env);
      this.completed = true;
    }

    const runResult = new RunResult(this._createRunResultOptions());
    testContext.runResult = runResult;
    return runResult;
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
    this.helpers.testDirectory(dirPath, () => cb?.call(this, path.resolve(dirPath)));
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
    if (this.temporaryDir && existsSync(this.temporaryDir)) {
      rmSync(this.temporaryDir, { recursive: true });
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
      rmSync(this.targetDirectory, { recursive: true });
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
    return this.onEnvironment(env => {
      lookups = Array.isArray(lookups) ? lookups : [lookups];
      for (const lookup of lookups) {
        env.lookup(lookup);
      }
    });
  }

  /**
   * Provide arguments to the run context
   * @param  args - command line arguments as Array or space separated string
   */
  withArguments(args: string | string[]): this {
    const argsArray = typeof args === 'string' ? args.split(' ') : args;
    assert(Array.isArray(argsArray), 'args should be either a string separated by spaces or an array');
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
      options[camelCase(key)] = options[key];
      options[kebabCase(key)] = options[key];
    }

    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * @deprecated
   * Mock the prompt with dummy answers
   * @param  answers - Answers to the prompt questions
   * @param  options - Options or callback.
   * @param  {Function} [options.callback] - Callback.
   * @param  {Boolean} [options.throwOnMissingAnswer] - Throw if a answer is missing.
   * @return {this}
   */

  withPrompts(answers: Generator.Answers, options?: DummyPromptOptions) {
    return this.withAnswers(answers, options);
  }

  /**
   * Mock answers for prompts
   * @param  answers - Answers to the prompt questions
   * @param  options - Options or callback.
   * @return {this}
   */
  withAnswers(answers: Generator.Answers, options?: DummyPromptOptions) {
    const callbackSet = Boolean(this.answers);
    this.answers = { ...this.answers, ...answers };
    if (callbackSet) return this;
    return this.onEnvironment(env => {
      this.helpers.mockPrompt(env, this.answers, options);
    });
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
    return this.onEnvironment(async env => {
      for (const dependency of dependencies) {
        if (Array.isArray(dependency)) {
          if (typeof dependency[0] === 'string') {
            // eslint-disable-next-line no-await-in-loop, @typescript-eslint/await-thenable
            await env.register(...(dependency as Parameters<Environment['register']>));
          } else {
            env.registerStub(...(dependency as Parameters<Environment['registerStub']>));
          }
        } else {
          // eslint-disable-next-line no-await-in-loop, @typescript-eslint/await-thenable
          await env.register(dependency);
        }
      }
    });
  }

  withMockedGeneratorFactory(mockedGeneratorFactory: MockedGeneratorFactory): this {
    this.mockedGeneratorFactory = mockedGeneratorFactory;
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
    const dependencies: Dependency[] = namespaces.map(namespace => [this.mockedGeneratorFactory(), namespace]);
    const entries = dependencies.map(([generator, namespace]) => [namespace, generator]);
    Object.assign(this.mockedGenerators, Object.fromEntries(entries));
    return this.withGenerators(dependencies);
  }

  /**
   * Mock the local configuration with the provided config
   * @param localConfig - should look just like if called config.getAll()
   */
  withLocalConfig(localConfig: Record<string, unknown>): this {
    assert(typeof localConfig === 'object', 'config should be an object');
    return this.onGenerator(generator => generator.config.defaults(localConfig));
  }

  /**
   * Don't reset mem-fs state cleared to aggregate snapshots from multiple runs.
   */
  withKeepFsState(): this {
    this.keepFsState = true;
    return this;
  }

  /**
   * Add files to mem-fs.
   * Files will be resolved relative to targetDir.
   *
   * Files with Object content will be merged to existing content.
   * To avoid merging, `JSON.stringify` the content.
   */
  withFiles(files: Record<string, string | Record<string, unknown>>): this;
  withFiles(relativePath: string, files: Record<string, string | Record<string, unknown>>): this;
  withFiles(
    relativePath: string | Record<string, string | Record<string, unknown>>,
    files?: Record<string, string | Record<string, unknown>>,
  ): this {
    return this.onTargetDirectory(function () {
      const targetDirectory = typeof relativePath === 'string' ? pathJoin(this.targetDirectory!, relativePath) : this.targetDirectory!;

      if (typeof relativePath !== 'string') {
        files = relativePath;
      }

      for (const [file, content] of Object.entries(files!)) {
        const resolvedFile = isAbsolute(file) ? file : resolve(targetDirectory, file);
        if (typeof content === 'string') {
          this.editor.write(resolvedFile, content);
        } else {
          const fileContent = this.editor.readJSON(resolvedFile, {});
          this.editor.writeJSON(resolvedFile, lodashMerge(fileContent, content));
        }
      }
    });
  }

  /**
   * Add .yo-rc.json to mem-fs.
   *
   * @param content
   * @returns
   */
  withYoRc(content: string | Record<string, unknown>): this {
    return this.withFiles({
      '.yo-rc.json': content,
    });
  }

  /**
   * Add a generator config to .yo-rc.json
   */
  withYoRcConfig(key: string, content: Record<string, unknown>): this {
    const yoRcContent = lodashSet({}, key, content);
    return this.withYoRc(yoRcContent);
  }

  /**
   * Commit mem-fs files.
   */
  commitFiles(): this {
    return this.onTargetDirectory(async function () {
      await (this.editor as any).commit();
    });
  }

  /**
   * Execute callback after targetDirectory is set
   * @param callback
   * @returns
   */
  onTargetDirectory(callback: (this: this, targetDirectory: string) => any): this {
    this.assertNotBuild();
    this.onTargetDirectoryCallbacks.push(callback);
    return this;
  }

  /**
   * Execute callback after generator is ready
   * @param callback
   * @returns
   */
  onGenerator(callback: (this: this, generator: GeneratorType) => any): this {
    this.assertNotBuild();
    this.onGeneratorCallbacks.push(callback);
    return this;
  }

  /**
   * Execute callback after environment is ready
   * @param callback
   * @returns
   */
  onEnvironment(callback: (this: this, env: Environment) => any): this {
    this.assertNotBuild();
    this.onEnvironmentCallbacks.push(callback);
    return this;
  }

  async prepare() {
    this.assertNotBuild();

    this.built = true;

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

    if (!this.targetDirectory) {
      throw new Error('targetDirectory is required');
    }

    if (!this.keepFsState) {
      this.memFs.each(file => {
        resetFileCommitStates(file);
      });
    }

    this.editor = createMemFsEditor(this.memFs);

    for (const onTargetDirectory of this.onTargetDirectoryCallbacks) {
      // eslint-disable-next-line no-await-in-loop
      await onTargetDirectory.call(this, this.targetDirectory);
    }
  }

  protected assertNotBuild() {
    if (this.built || this.completed) {
      throw new Error('The context is already built');
    }
  }

  /**
   * Build the generator and the environment.
   * @return {RunContext|false} this
   */
  protected async build(): Promise<void> {
    await this.prepare();

    const testEnv = await this.helpers.createTestEnv(this.envOptions.createEnv, {
      cwd: this.settings.forwardCwd ? this.targetDirectory : undefined,
      sharedFs: this.memFs,
      ...this.options,
      ...this.envOptions,
    });
    this.env = this.envCB ? (await this.envCB(testEnv)) ?? testEnv : testEnv;

    for (const onEnvironmentCallback of this.onEnvironmentCallbacks) {
      // eslint-disable-next-line no-await-in-loop
      await onEnvironmentCallback.call(this, this.env);
    }

    const { namespace = typeof this.Generator === 'string' ? this.env.namespace(this.Generator) : 'gen:test' } = this.settings;
    if (typeof this.Generator === 'string' && namespace !== this.Generator) {
      // Generator is a file path, it should be registered.
      this.env.register(this.Generator, namespace);
    } else if (typeof this.Generator !== 'string') {
      const { resolved } = this.settings;
      this.env.registerStub(this.Generator as unknown as any, namespace, resolved);
    }

    // eslint-disable-next-line @typescript-eslint/await-thenable
    this.generator = (await this.env.create(namespace, this.args, this.options)) as any;

    for (const onGeneratorCallback of this.onGeneratorCallbacks) {
      // eslint-disable-next-line no-await-in-loop
      await onGeneratorCallback.call(this, this.generator);
    }
  }

  /**
   * Return a promise representing the generator run process
   * @return Promise resolved on end or rejected on error
   */
  protected async toPromise(): PromiseRunResult<GeneratorType> {
    return this.environmentPromise ?? this.run();
  }

  protected _createRunResultOptions(): RunResultOptions<GeneratorType> {
    return {
      env: this.env,
      generator: this.generator,
      memFs: this.env?.sharedFs ?? this.memFs,
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

  /**
   * Keeps compatibility with events
   */

  private setupEventListeners(): Promise<void | RunResult<GeneratorType>> | undefined {
    if (this.eventListenersSet) {
      return undefined;
    }

    this.eventListenersSet = true;

    this.onGenerator(generator => this.emit('ready', generator));
    this.onGenerator(generator => this.emit('generator', generator));

    return this.build().then(async () =>
      this.run()
        .catch(error => {
          if (this.listenerCount('end') === 0 && this.listenerCount('error') === 0) {
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
}

export default class RunContext<GeneratorType extends Generator = Generator>
  extends RunContextBase<GeneratorType>
  implements Promise<RunResult<GeneratorType>>
{
  // eslint-disable-next-line unicorn/no-thenable
  async then<TResult1 = RunResult<GeneratorType>, TResult2 = never>(
    onfulfilled?: ((value: RunResult<GeneratorType>) => TResult1 | PromiseLike<TResult1>) | undefined | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | undefined,
  ): Promise<TResult1 | TResult2> {
    return this.toPromise().then(onfulfilled, onrejected);
  }

  async catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | undefined,
  ): Promise<RunResult<GeneratorType> | TResult> {
    return this.toPromise().catch(onrejected);
  }

  async finally(onfinally?: (() => void) | undefined | undefined): Promise<RunResult<GeneratorType>> {
    return this.toPromise().finally(onfinally);
  }

  get [Symbol.toStringTag](): string {
    return `RunContext`;
  }
}

export class BasicRunContext extends RunContext {
  async run(): PromiseRunResult<any> {
    await this.prepare();
    const runResult = new RunResult(this._createRunResultOptions());
    testContext.runResult = runResult;
    return runResult;
  }
}
