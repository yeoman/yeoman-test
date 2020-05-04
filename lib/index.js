/* eslint-disable max-params */
/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @module test/helpers
 */

'use strict';
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var yeoman = require('yeoman-environment');
var Generator = require('yeoman-generator');
var adapter = require('./adapter');

/**
 * Create a function that will clean up the test directory,
 * cd into it, and create a dummy gruntfile inside. Intended for use
 * as a callback for the mocha `before` hook.
 *
 * @param {String} dir - path to the test directory
 * @returns {Function} mocha callback
 */

exports.setUpTestDirectory = function(dir) {
  return function(done) {
    exports.testDirectory(dir, function() {
      exports.gruntfile({ dummy: true }, done);
    });
  };
};

/**
 *
 * Generates a new Gruntfile.js in the current working directory based on
 * options hash passed in.
 *
 * @param {Object} options - Grunt configuration
 * @param {Function} done  - callback to call on completion
 * @example
 * before(helpers.gruntfile({
 *   foo: {
 *     bar: '<config.baz>'
 *   }
 * }));
 *
 */

exports.gruntfile = function(options, done) {
  var config = 'grunt.initConfig(' + JSON.stringify(options, null, 2) + ');';

  config = config
    .split('\n')
    .map(function(line) {
      return '  ' + line;
    })
    .join('\n');

  var out = ['module.exports = function (grunt) {', config, '};'];

  fs.writeFile('Gruntfile.js', out.join('\n'), done);
};

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

exports.testDirectory = function(dir, cb) {
  if (!dir) {
    throw new Error('Missing directory');
  }

  dir = path.resolve(dir);

  // Make sure we're not deleting CWD by moving to top level folder. As we `cd` in the
  // test dir after cleaning up, this shouldn't be perceivable.
  process.chdir('/');

  try {
    rimraf.sync(dir);
    mkdirp.sync(dir);
    process.chdir(dir);
    cb();
  } catch (err) {
    return cb(err);
  }
};

/**
 * Answer prompt questions for the passed-in generator
 * @param {Generator|Environment} generator - a Yeoman generator or environment
 * @param {Object} answers - an object where keys are the
 *   generators prompt names and values are the answers to
 *   the prompt questions
 * @example
 * mockPrompt(angular, {'bootstrap': 'Y', 'compassBoostrap': 'Y'});
 */

exports.mockPrompt = function(envOrGenerator, answers, callback) {
  envOrGenerator = envOrGenerator.env || envOrGenerator;
  var promptModule = envOrGenerator.adapter.promptModule;
  answers = answers || {};
  var DummyPrompt = adapter.DummyPrompt;

  Object.keys(promptModule.prompts).forEach(function(name) {
    promptModule.registerPrompt(name, DummyPrompt.bind(DummyPrompt, answers, callback));
  });
};

/**
 * Restore defaults prompts on a generator.
 * @param {Generator|Environment} generator or environment
 */
exports.restorePrompt = function(envOrGenerator) {
  envOrGenerator = envOrGenerator.env || envOrGenerator;
  envOrGenerator.adapter.promptModule.restoreDefaultPrompts();
};

/**
 * Provide mocked values to the config
 * @param  {Generator} generator - a Yeoman generator
 * @param  {Object} localConfig - localConfig - should look just like if called config.getAll()
 */
exports.mockLocalConfig = function(generator, localConfig) {
  generator.config.defaults(localConfig);
};

/**
 * Create a simple, dummy generator
 */

exports.createDummyGenerator = () =>
  class extends Generator {
    test() {
      this.shouldRun = true;
    }
  };

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

exports.createGenerator = function(
  name,
  dependencies,
  args,
  options,
  localConfigOnly = true
) {
  var env = yeoman.createEnv([], { sharedOptions: { localConfigOnly } });
  this.registerDependencies(env, dependencies);

  return env.create(name, { arguments: args, options: options });
};

/**
 * Register a list of dependent generators into the provided env.
 * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
 *
 * @param {Array} dependencies - paths to the generators dependencies
 */

exports.registerDependencies = function(env, dependencies) {
  dependencies.forEach(function(dependency) {
    if (_.isArray(dependency)) {
      env.registerStub.apply(env, dependency);
    } else {
      env.register(dependency);
    }
  });
};

/**
 * Creates a test environment.
 *
 * @param {Function} envContructor - environment constructor method.
 * @param {Object} [options] - Options to be passed to the environment
 * @returns {Object} environment instance
 * const env = setupEnv(require('yeoman-environment').createEnv);
 */

exports.createTestEnv = function(
  envContructor = yeoman.createEnv,
  options = { localConfigOnly: true }
) {
  if (typeof options === 'boolean') {
    options = { sharedOptions: { localConfigOnly: options } };
  } else if (
    !options.sharedOptions ||
    options.sharedOptions.localConfigOnly === undefined
  ) {
    options.sharedOptions = options.sharedOptions || {};
    options.sharedOptions.localConfigOnly = true;
  }

  return envContructor([], options, new adapter.TestAdapter());
};

/**
 * Run the provided Generator
 * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
 * @return {RunContext}
 */

exports.run = function(GeneratorOrNamespace, settings, envOptions) {
  var RunContext = require('./run-context');
  return new RunContext(GeneratorOrNamespace, settings, envOptions);
};

/**
 * Prepare a run context
 * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
 * @return {RunContext}
 */

exports.create = function(GeneratorOrNamespace, settings, envOptions) {
  var RunContext = require('./run-context');
  const context = new RunContext(
    GeneratorOrNamespace,
    { ...settings, runEnvironment: true },
    envOptions
  );

  return context;
};
