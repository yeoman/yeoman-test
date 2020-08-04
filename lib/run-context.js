'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const _ = require('lodash/string');
const util = require('util');
const {EventEmitter} = require('events');
const helpers = require('.');
const RunResult = require('./run-result');

/**
 * Wrap callback so it can't get called twice
 */
const callbackWrapper = (done) => {
  let callbackHandled = false;
  const callback = (err) => {
    if (!callbackHandled) {
      callbackHandled = true;
      done(err);
    }
  };

  return callback;
};

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

function RunContext(Generator, settings, envOptions = {}) {
  this._asyncHolds = 0;
  this.ran = false;
  this.inDirSet = false;
  this.args = [];
  this.options = {};
  this.answers = {};
  this.localConfig = null;
  this.dependencies = [];
  this.Generator = Generator;
  this.inDirCallbacks = [];
  this.lookups = [];
  this.mockedGenerators = {};
  this.settings = {
    namespace: 'gen:test',
    runEnvironment: false,
    ...settings
  };
  this.envOptions = envOptions;

  this.withOptions({
    force: true,
    skipCache: true,
    skipInstall: true
  });
  this.oldCwd = this.settings.oldCwd;
  if (this.settings.cwd) {
    this.cd(this.settings.cwd);
  }

  if (!this.settings.runEnvironment) {
    setTimeout(this._run.bind(this), 10);
  }
}

util.inherits(RunContext, EventEmitter);

/**
 * Hold the execution until the returned callback is triggered
 * @return {Function} Callback to notify the normal execution can resume
 */

RunContext.prototype.async = function () {
  this._asyncHolds++;

  return function () {
    this._asyncHolds--;
    this._run();
  }.bind(this);
};

/**
 * Build the generator and the environment.
 * @return {RunContext|false} this
 */
RunContext.prototype.build = function (callback = () => {}) {
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
    const targetDirectory = path.resolve(this.targetDirectory);
    this.inDirCallbacks.forEach((cb) => cb(targetDirectory));
  }

  this.targetDirectory = this.targetDirectory || process.cwd();

  const testEnv = helpers.createTestEnv(
    this.envOptions.createEnv,
    this.envOptions
  );
  this.env = this.envCB ? this.envCB(testEnv) || testEnv : testEnv;

  this.lookups.forEach((lookup) => {
    this.env.lookup(lookup);
  });

  helpers.registerDependencies(this.env, this.dependencies);

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

  this.generator = this.env.create(namespace, {
    arguments: this.args,
    options: this.options
  });

  helpers.mockPrompt(this.env, this.answers, this.promptOptions);

  if (this.localConfig) {
    // Only mock local config when withLocalConfig was called
    helpers.mockLocalConfig(this.generator, this.localConfig);
  }

  callback(this);
  return this;
};

/**
 * Method called when the context is ready to run the generator
 * @private
 */

RunContext.prototype._run = function () {
  this.buildAsync = true;
  if (this.build() === false) return false;

  const endCallback = callbackWrapper((envOrGenerator) => {
    helpers.restorePrompt(envOrGenerator);
    this.emit('end');
    this.completed = true;
  });

  const callback = callbackWrapper((err) => {
    helpers.restorePrompt(this.env);
    this.errored = true;
    this.emit('error', err);
  });

  // Yeoman-generator >=5.0.0 doesn't emits error on itself, it emits on the environment.
  this.generator.on('error', callback);

  this.env.on('error', callback);
  this.env.runLoop.once('end', () => endCallback(this.generator));
  this.emit('ready', this.generator);

  this.generator.run().catch(callback);
  return true;
};

/**
 * Run the generator on the environment and returns the promise.
 * @return {Promise} Promise
 */
RunContext.prototype.run = function () {
  if (!this.settings.runEnvironment) {
    throw new Error('Should be called with runEnvironment option');
  }

  if (!this.ran) {
    this.build();
  }

  return this.env
    .runGenerator(this.generator)
    .then(() => new RunResult(this._createRunResultOptions()))
    .finally(() => {
      helpers.restorePrompt(this.env);
    });
};

RunContext.prototype._createRunResultOptions = function () {
  return {
    env: this.env,
    memFs: this.env.sharedFs,
    settings: {
      ...this.settings
    },
    oldCwd: this.oldCwd,
    cwd: this.targetDirectory,
    envOptions: this.envOptions,
    mockedGenerators: this.mockedGenerators
  };
};

/**
 * Return a promise representing the generator run process
 * @return {Promise} Promise resolved on end or rejected on error
 */
RunContext.prototype.toPromise = function () {
  if (this.settings.runEnvironment) {
    throw new Error('RunContext with runEnvironment uses promises by default');
  }

  return new Promise(
    function (resolve, reject) {
      this.on(
        'end',
        function () {
          resolve(this.targetDirectory);
        }.bind(this)
      );
      this.on('error', reject);
    }.bind(this)
  );
};

/**
 * Promise `.then()` duck typing
 * @return {Promise}
 */
RunContext.prototype.then = function () {
  const promise = this.toPromise();
  return promise.then(...arguments);
};

/**
 * Promise `.catch()` duck typing
 * @return {Promise}
 */
RunContext.prototype.catch = function () {
  const promise = this.toPromise();
  return promise.catch(...arguments);
};

/**
 * Set the target directory.
 * @private
 * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
 *                            file path for predictable results
 * @return {this} run context instance
 */

RunContext.prototype.setDir = function (dirPath, tmpdir) {
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
};

/**
 * Clean the provided directory, then change directory into it
 * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
 *                            file path for predictable results
 * @param {Function} [cb] - callback who'll receive the folder path as argument
 * @return {this} run context instance
 */

RunContext.prototype.inDir = function (dirPath, cb) {
  this.setDir(dirPath, true);
  helpers.testDirectory(
    dirPath,
    (cb || (() => {})).bind(this, path.resolve(dirPath))
  );
  return this;
};

/**
 * Register an callback to prepare the destination folder.
 * @param {Function} [cb] - callback who'll receive the folder path as argument
 * @return {this} run context instance
 */

RunContext.prototype.doInDir = function (cb) {
  this.inDirCallbacks.push(cb);
  return this;
};

/**
 * Change directory without deleting directory content.
 * @param  {String} dirPath - Directory path (relative to CWD). Prefer passing an absolute
 *                            file path for predictable results
 * @return {this} run context instance
 */
RunContext.prototype.cd = function (dirPath) {
  dirPath = path.resolve(dirPath);
  this.setDir(dirPath, false);
  try {
    process.chdir(dirPath);
  } catch (error) {
    this.completed = true;
    throw new Error(error.message + ' ' + dirPath);
  }

  return this;
};

/**
 * Creates a temporary directory and change the CWD into it
 *
 * This method is called automatically when creating a RunContext. Only use it if you need
 * to use the callback.
 *
 * @param {Function} [cb] - callback who'll receive the folder path as argument
 * @return {this} run context instance
 */
RunContext.prototype.inTmpDir = function (cb) {
  return this.inDir(
    path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex')),
    cb
  );
};

/**
 * Create an environment
 *
 * This method is called automatically when creating a RunContext. Only use it if you need
 * to use the callback.
 *
 * @param {Function} [cb] - callback who'll receive the folder path as argument
 * @return {this} run context instance
 */
RunContext.prototype.withEnvironment = function (cb) {
  this.envCB = cb;
  return this;
};

/**
 * Run lookup on the environment.
 *
 * @param {Object|Array} [lookups] - lookup to run.
 * @return {this} run context instance.
 */
RunContext.prototype.withLookups = function (lookups) {
  lookups = Array.isArray(lookups) ? lookups : [lookups];
  this.lookups = this.lookups.concat(lookups);
  return this;
};

/**
 * Clean the directory used for tests inside inDir/inTmpDir
 * @param  {Boolean} force - force directory cleanup for not tmpdir
 */
RunContext.prototype.cleanTestDirectory = function (force = false) {
  if (!force && this.settings.tmpdir === false) {
    throw new Error('Cleanup test dir called with false tmpdir option.');
  }

  if (this.targetDirectory && fs.existsSync(this.targetDirectory)) {
    fs.rmdirSync(this.targetDirectory, {recursive: true});
  }
};

/**
 * Provide arguments to the run context
 * @param  {String|Array} args - command line arguments as Array or space separated string
 * @return {this}
 */

RunContext.prototype.withArguments = function (args) {
  const argsArray = typeof args === 'string' ? args.split(' ') : args;
  assert(
    Array.isArray(argsArray),
    'args should be either a string separated by spaces or an array'
  );
  this.args = this.args.concat(argsArray);
  return this;
};

/**
 * Provide options to the run context
 * @param  {Object} options - command line options (e.g. `--opt-one=foo`)
 * @return {this}
 */

RunContext.prototype.withOptions = function (options) {
  // Add options as both kebab and camel case. This is to stay backward compatibles with
  // the switch we made to meow for options parsing.
  Object.keys(options).forEach(function (key) {
    options[_.camelCase(key)] = options[key];
    options[_.kebabCase(key)] = options[key];
  });

  this.options = {...this.options, ...options};
  return this;
};

/**
 * Mock the prompt with dummy answers
 * @param  {Object} answers - Answers to the prompt questions
 * @param  {Object|Function}   [options] - Options or callback.
 * @param  {Function} [options.callback] - Callback.
 * @param  {Boolean} [options.throwOnMissingAnswer] - Throw if a answer is missing.
 * @return {this}
 */

RunContext.prototype.withPrompts = function (answers, options) {
  this.answers = {...this.answers, ...answers};
  this.promptOptions = options;
  return this;
};

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

RunContext.prototype.withGenerators = function (dependencies) {
  assert(Array.isArray(dependencies), 'dependencies should be an array');
  this.dependencies = this.dependencies.concat(dependencies);
  return this;
};

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

RunContext.prototype.withMockedGenerators = function (namespaces) {
  assert(Array.isArray(namespaces), 'namespaces should be an array');
  const entries = namespaces.map((namespace) => [
    namespace,
    helpers.createMockedGenerator()
  ]);
  this.mockedGenerators = {
    ...this.mockedGenerators,
    ...Object.fromEntries(entries)
  };
  const dependencies = entries.map(([namespace, generator]) => [
    generator,
    namespace
  ]);
  this.dependencies = this.dependencies.concat(dependencies);
  return this;
};

/**
 * Mock the local configuration with the provided config
 * @param  {Object} localConfig - should look just like if called config.getAll()
 * @return {this}
 */
RunContext.prototype.withLocalConfig = function (localConfig) {
  assert(typeof localConfig === 'object', 'config should be an object');
  this.localConfig = localConfig;
  return this;
};

module.exports = RunContext;
