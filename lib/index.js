/* eslint-disable max-params */

'use strict';
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const sinon = require('sinon');
const adapter = require('./adapter');

/**
 * Collection of unit test helpers. (mostly related to Mocha syntax)
 * @class YeomanTest
 */

class YeomanTest {}

/**
 * Create a function that will clean up the test directory,
 * cd into it, and create a dummy gruntfile inside. Intended for use
 * as a callback for the mocha `before` hook.
 *
 * @param {String} dir - path to the test directory
 * @returns {Function} mocha callback
 */

YeomanTest.prototype.setUpTestDirectory = function (dir) {
  return (done) => {
    this.testDirectory(dir, () => {
      this.gruntfile({dummy: true}, done);
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

YeomanTest.prototype.gruntfile = function (options, done) {
  let config = 'grunt.initConfig(' + JSON.stringify(options, null, 2) + ');';

  config = config
    .split('\n')
    .map(function (line) {
      return '  ' + line;
    })
    .join('\n');

  const out = ['module.exports = function (grunt) {', config, '};'];

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

YeomanTest.prototype.testDirectory = function (dir, cb) {
  if (!dir) {
    throw new Error('Missing directory');
  }

  dir = path.resolve(dir);

  // Make sure we're not deleting CWD by moving to top level folder. As we `cd` in the
  // test dir after cleaning up, this shouldn't be perceivable.
  process.chdir('/');

  try {
    if (fs.existsSync(dir)) {
      fs.rmdirSync(dir, {recursive: true});
    }

    fs.mkdirSync(dir, {recursive: true});
    process.chdir(dir);
    cb();
  } catch (error) {
    return cb(error);
  }
};

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

YeomanTest.prototype.mockPrompt = function (
  envOrGenerator,
  mockedAnswers,
  options
) {
  envOrGenerator = envOrGenerator.env || envOrGenerator;
  const {promptModule} = envOrGenerator.adapter;
  const {DummyPrompt} = adapter;

  Object.keys(promptModule.prompts).forEach(function (name) {
    promptModule.registerPrompt(
      name,
      class CustomDummyPrompt extends DummyPrompt {
        constructor(question, rl, answers) {
          super(mockedAnswers, options, question, rl, answers);
        }
      }
    );
  });
};

/**
 * Restore defaults prompts on a generator.
 * @param {Generator|Environment} generator or environment
 */
YeomanTest.prototype.restorePrompt = function (envOrGenerator) {
  envOrGenerator = envOrGenerator.env || envOrGenerator;
  envOrGenerator.adapter.promptModule.restoreDefaultPrompts();
};

/**
 * Provide mocked values to the config
 * @param  {Generator} generator - a Yeoman generator
 * @param  {Object} localConfig - localConfig - should look just like if called config.getAll()
 */
YeomanTest.prototype.mockLocalConfig = function (generator, localConfig) {
  generator.config.defaults(localConfig);
};

/**
 * Create a mocked generator
 */

YeomanTest.prototype.createMockedGenerator = (
  Generator = class MockedGenerator extends require('yeoman-generator') {}
) => {
  const generator = sinon.spy(Generator);
  ['run', 'queueTasks', 'runWithOptions', 'queueOwnTasks'].forEach(
    (methodName) => {
      if (Generator.prototype[methodName]) {
        generator.prototype[methodName] = sinon.stub();
      }
    }
  );
  return generator;
};

/**
 * Create a simple, dummy generator
 */

YeomanTest.prototype.createDummyGenerator = (
  Generator = require('yeoman-generator')
) =>
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

YeomanTest.prototype.createGenerator = function (
  name,
  dependencies,
  args,
  options,
  localConfigOnly = true
) {
  const env = this.createEnv([], {sharedOptions: {localConfigOnly}});
  this.registerDependencies(env, dependencies);

  return env.create(name, {arguments: args, options});
};

/**
 * Register a list of dependent generators into the provided env.
 * Dependecies can be path (autodiscovery) or an array [{generator}, {name}]
 *
 * @param {Array} dependencies - paths to the generators dependencies
 */

YeomanTest.prototype.registerDependencies = function (env, dependencies) {
  dependencies.forEach(function (dependency) {
    if (Array.isArray(dependency)) {
      env.registerStub(...dependency);
    } else {
      env.register(dependency);
    }
  });
};

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

YeomanTest.prototype.createEnv = (...args) => {
  return require('yeoman-environment').createEnv(...args);
};

/**
 * Creates a test environment.
 *
 * @param {Function} envContructor - environment constructor method.
 * @param {Object} [options] - Options to be passed to the environment
 * @returns {Object} environment instance
 * const env = createTestEnv(require('yeoman-environment').createEnv);
 */

YeomanTest.prototype.createTestEnv = function (
  envContructor = this.createEnv,
  options = {localConfigOnly: true}
) {
  const envOptions = _.cloneDeep(this.environmentOptions || {});
  if (typeof options === 'boolean') {
    options = {
      newErrorHandler: true,
      ...envOptions,
      sharedOptions: {
        localConfigOnly: options,
        ...envOptions.sharedOptions
      }
    };
  } else {
    options = {
      newErrorHandler: true,
      ...envOptions,
      ...options
    };
    options.sharedOptions = {
      localConfigOnly: true,
      ...envOptions.sharedOptions,
      ...options.sharedOptions
    };
  }

  return envContructor([], options, new adapter.TestAdapter());
};

/**
 * Run the provided Generator
 * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
 * @return {RunContext}
 */

YeomanTest.prototype.run = function (
  GeneratorOrNamespace,
  settings,
  envOptions
) {
  const RunContext = require('./run-context');
  const contextSettings = _.cloneDeep(this.settings || {});
  const generatorOptions = _.cloneDeep(this.generatorOptions || {});
  return new RunContext(
    GeneratorOrNamespace,
    {...contextSettings, ...settings},
    envOptions,
    this
  ).withOptions(generatorOptions);
};

/**
 * Prepare a run context
 * @param  {String|Function} GeneratorOrNamespace - Generator constructor or namespace
 * @return {RunContext}
 */

YeomanTest.prototype.create = function (
  GeneratorOrNamespace,
  settings,
  envOptions
) {
  return this.run(
    GeneratorOrNamespace,
    {...settings, runEnvironment: true},
    envOptions
  );
};

const helpers = new YeomanTest();
helpers.YeomanTest = YeomanTest;

module.exports = helpers;

helpers.createHelpers = (options) => {
  const helpers = new YeomanTest();
  Object.assign(helpers, options);
  return helpers;
};
