import crypto from 'node:crypto';
import {existsSync, rmSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import process from 'node:process';
import _ from 'lodash';
import tempDirectory from 'temp-dir';

import RunResult from './run-result.js';
import defaultHelpers, {type YeomanTest} from './index.js';

export default class RunContext extends EventEmitter {
  _asyncHolds = 0;
  ran = false;
  inDirSet = false;
  args: string[] = [];
  options: any = {};
  answers: any = {};

  localConfig: any = null;
  dependencies: any[] = [];
  inDirCallbacks: any[] = [];
  lookups: any[] = [];
  mockedGenerators: any = {};

  Generator: any;
  settings: any;
  envOptions: any;
  oldCwd: string;
  helpers: YeomanTest;
  buildAsync: any;
  targetDirectory?: string;
  env: any;
  errored = false;
  completed = false;
  generator: any;
  envCB: any;
  promptOptions: any;

  private _generatorPromise: any;

  /**
   * This class provide a run context object to façade the complexity involved in setting
   * up a generator for testing
   * @constructor
   * @param {String|Function} Generator - Namespace or generator constructor. If the later
   *                                       is provided, then namespace is assumed to be
   *                                       'gen:test' in all cases
   * @param {Object} [settings]
   * @param {Boolean} [settings.tmpdir] - Automatically run this generator in a tmp dir
   * @param {String} [settings.resolved] - File path to the generator (only used if Generator is a constructor)
   * @param {String} [settings.namespace='gen:test'] - Namespace (only used if Generator is a constructor)
   * @param {String} [settings.runEnvironment=false] - Require the run context to call run.
   * @param {Object} [envOptions] - Options to be passed to environment.
   * @return {this}
   */

  constructor(Generator, settings, envOptions = {}, helpers = defaultHelpers) {
    super();
    this.Generator = Generator;
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

    if (!this.settings.runEnvironment) {
      setTimeout(this._run.bind(this), 10);
    }

    this.helpers = helpers;
  }

  /**
   * Hold the execution until the returned callback is triggered
   * @return {Function} Callback to notify the normal execution can resume
   */

  async() {
    this._asyncHolds++;

    return () => {
      this._asyncHolds--;
      this._run();
    };
  }

  /**
   * Build the generator and the environment.
   * @return {RunContext|false} this
   */
  build(callback?: (context: any) => any) {
    if (!this.inDirSet && this.settings.tmpdir !== false) {
      this.inTmpDir();
    }

    if (this._asyncHolds !== 0 || this.ran || this.completed) {
      if (this.buildAsync) {
        return false;
      }

      throw new Error('The context is not ready');
    }

    this.ran = true;
    if (this.inDirCallbacks.length > 0) {
      const targetDirectory = path.resolve(this.targetDirectory!);
      for (const cb of this.inDirCallbacks) cb(targetDirectory);
    }

    this.targetDirectory = this.targetDirectory ?? process.cwd();

    const testEnv = this.helpers.createTestEnv(this.envOptions.createEnv, {
      cwd: this.settings.forwardCwd ? this.targetDirectory : undefined,
      ...this.options,
      ...this.envOptions,
    });
    this.env = this.envCB ? this.envCB(testEnv) || testEnv : testEnv;

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
      this.env.registerStub(this.Generator, namespace, this.settings.resolved);
    }

    this._generatorPromise = Promise.resolve(
      this.env.create(namespace, {
        arguments: this.args,
        options: this.options,
      }),
    );

    this._generatorPromise.then((generator) => {
      this.generator = generator;
    });

    this.helpers.mockPrompt(this.env, this.answers, this.promptOptions);

    if (this.localConfig) {
      // Only mock local config when withLocalConfig was called
      this._generatorPromise = this._generatorPromise.then((generator) => {
        this.helpers.mockLocalConfig(generator, this.localConfig);
        return generator;
      });
    }

    callback?.(this);
    return this;
  }

  /**
   * Method called when the context is ready to run the generator
   * @private
   */

  _run() {
    this.buildAsync = true;
    if (this.build() === false) return false;

    this._generatorPromise.then((generator) => this.emit('ready', generator));

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
        this.completed = true;
      });

    return true;
  }

  /**
   * Run the generator on the environment and promises a RunResult instance.
   * @return {Promise<RunResult>} Promise a RunResult instance.
   */
  run() {
    if (!this.settings.runEnvironment && this.buildAsync === undefined) {
      throw new Error('Should be called with runEnvironment option');
    }

    if (!this.ran) {
      this.build();
    }

    return this._generatorPromise.then((generator) =>
      this.env
        .runGenerator(generator)
        .then(() => new RunResult(this._createRunResultOptions()))
        .finally(() => {
          this.helpers.restorePrompt(this.env);
        }),
    );
  }

  _createRunResultOptions() {
    return {
      env: this.env,
      generator: this.generator,
      memFs: this.env.sharedFs,
      settings: {
        ...this.settings,
      },
      oldCwd: this.oldCwd,
      cwd: this.targetDirectory,
      envOptions: this.envOptions,
      mockedGenerators: this.mockedGenerators,
    };
  }

  /**
   * Return a promise representing the generator run process
   * @return {Promise} Promise resolved on end or rejected on error
   */
  async toPromise() {
    if (this.settings.runEnvironment) {
      throw new Error(
        'RunContext with runEnvironment uses promises by default',
      );
    }

    return new Promise((resolve, reject) => {
      this.on('end', () => {
        resolve(new RunResult(this._createRunResultOptions()));
      });
      this.on('error', reject);
    });
  }

  /**
   * Promise `.then()` duck typing
   * @return {Promise}
   */
  // eslint-disable-next-line unicorn/no-thenable
  async then(...args) {
    const promise = this.toPromise();
    return promise.then(...args);
  }

  /**
   * Promise `.catch()` duck typing
   * @return {Promise}
   */
  async catch(...args) {
    const promise = this.toPromise();
    return promise.catch(...args);
  }

  /**
   * Set the target directory.
   * @private
   * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @return {this} run context instance
   */

  setDir(dirPath, tmpdir) {
    if (this.inDirSet) {
      this.completed = true;
      throw new Error('Test directory has already been set.');
    }

    if (tmpdir !== undefined) {
      this.settings.tmpdir = tmpdir;
    }

    this.oldCwd = this.oldCwd || process.cwd();

    this.inDirSet = true;
    this.targetDirectory = dirPath;
    return this;
  }

  /**
   * Clean the provided directory, then change directory into it
   * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @param {Function} [cb] - callback who'll receive the folder path as argument
   * @return {this} run context instance
   */

  inDir(dirPath, cb) {
    this.setDir(dirPath, true);
    this.helpers.testDirectory(dirPath, () =>
      cb?.call(this, path.resolve(dirPath)),
    );
    return this;
  }

  /**
   * Register an callback to prepare the destination folder.
   * @param {Function} [cb] - callback who'll receive the folder path as argument
   * @return {this} run context instance
   */

  doInDir(cb) {
    this.inDirCallbacks.push(cb);
    return this;
  }

  /**
   * Change directory without deleting directory content.
   * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
   *                            file path for predictable results
   * @return {this} run context instance
   */
  cd(dirPath: string) {
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
   * Creates a temporary directory and change the CWD into it
   *
   * This method is called automatically when creating a RunContext. Only use it if you need
   * to use the callback.
   *
   * @param {Function} [cb] - callback who'll receive the folder path as argument
   * @return {this} run context instance
   */
  inTmpDir(cb?) {
    return this.inDir(
      path.join(tempDirectory, crypto.randomBytes(20).toString('hex')),
      cb,
    );
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
   * @param {Object|Array} [lookups] - lookup to run.
   * @return {this} run context instance.
   */
  withLookups(lookups) {
    this.lookups = this.lookups.concat(lookups);
    return this;
  }

  /**
   * Clean the directory used for tests inside inDir/inTmpDir
   * @param  {Boolean} force - force directory cleanup for not tmpdir
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
   * Provide arguments to the run context
   * @param  args - command line arguments as Array or space separated string
   */

  withArguments(args: string | string[]) {
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

  withOptions(options) {
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

  withPrompts(answers, options) {
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

  withGenerators(dependencies) {
    assert(Array.isArray(dependencies), 'dependencies should be an array');
    this.dependencies = this.dependencies.concat(dependencies);
    return this;
  }

  /**
 * Create mocked generators
 * @param {Array} namespaces - namespaces of mocked generators
 * @return {this}
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

  withMockedGenerators(namespaces) {
    assert(Array.isArray(namespaces), 'namespaces should be an array');
    const entries = namespaces.map((namespace) => [
      namespace,
      this.helpers.createMockedGenerator(),
    ]);
    this.mockedGenerators = {
      ...this.mockedGenerators,
      ...Object.fromEntries(entries),
    };
    const dependencies = entries.map(([namespace, generator]) => [
      generator,
      namespace,
    ]);
    this.dependencies = this.dependencies.concat(dependencies);
    return this;
  }

  /**
   * Mock the local configuration with the provided config
   * @param  {Object} localConfig - should look just like if called config.getAll()
   * @return {this}
   */
  withLocalConfig(localConfig) {
    assert(typeof localConfig === 'object', 'config should be an object');
    this.localConfig = localConfig;
    return this;
  }
}
