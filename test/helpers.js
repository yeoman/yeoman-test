'use strict';
const assert = require('assert');
const path = require('path');
const sinon = require('sinon');
const util = require('util');
const yeoman = require('yeoman-environment');
const Generator = require('yeoman-generator');

const helpers = require('../lib');
const {TestAdapter} = require('../lib/adapter');
const RunContext = require('../lib/run-context');
const env = yeoman.createEnv(undefined, undefined, new TestAdapter());

describe('yeoman-test', function () {
  beforeEach(function () {
    process.chdir(path.join(__dirname, './fixtures'));
    const self = this;

    this.StubGenerator = function (args, options) {
      self.args = args;
      self.options = options;
    };

    util.inherits(this.StubGenerator, Generator);
  });

  describe('.registerDependencies()', function () {
    it('accepts dependency as a path', function () {
      helpers.registerDependencies(env, [
        require.resolve('./fixtures/generator-simple/app')
      ]);
      assert(env.get('simple:app'));
    });

    it('accepts dependency as array of [<generator>, <name>]', function () {
      helpers.registerDependencies(env, [[this.StubGenerator, 'stub:app']]);
      assert(env.get('stub:app'));
    });
  });

  describe('.createGenerator()', function () {
    it('create a new generator', function () {
      const generator = helpers.createGenerator('unicorn:app', [
        [this.StubGenerator, 'unicorn:app']
      ]);

      assert.ok(generator instanceof this.StubGenerator);
    });

    it('pass args params to the generator', function () {
      helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp']
      );

      assert.deepEqual(this.args, ['temp']);
    });

    it('pass options param to the generator', function () {
      helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp'],
        {ui: 'tdd'}
      );

      assert.equal(this.options.ui, 'tdd');
    });
  });

  describe('.mockPrompt()', function () {
    beforeEach(function () {
      this.generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(this.generator, {answer: 'foo'});
    });

    it('uses default values', function () {
      return this.generator
        .prompt([{name: 'respuesta', type: 'input', default: 'bar'}])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses default values when no answer is passed', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator);
      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'input', default: 'bar'}
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('supports `null` answer for `list` type', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());

      helpers.mockPrompt(generator, {
        respuesta: null
      });

      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'list', default: 'bar'}
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, null);
        });
    });

    it('treats `null` as no answer for `input` type', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());

      helpers.mockPrompt(generator, {
        respuesta: null
      });

      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'input', default: 'bar'}
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses `true` as the default value for `confirm` type', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, {});

      return generator
        .prompt([{name: 'respuesta', message: 'foo', type: 'confirm'}])
        .then(function (answers) {
          assert.equal(answers.respuesta, true);
        });
    });

    it('supports `false` answer for `confirm` type', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, {respuesta: false});

      return generator
        .prompt([{name: 'respuesta', message: 'foo', type: 'confirm'}])
        .then(function (answers) {
          assert.equal(answers.respuesta, false);
        });
    });

    it('prefers mocked values over defaults', function () {
      return this.generator
        .prompt([{name: 'answer', type: 'input', default: 'bar'}])
        .then(function (answers) {
          assert.equal(answers.answer, 'foo');
        });
    });

    it('can be call multiple time on the same generator', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, {foo: 1});
      helpers.mockPrompt(generator, {foo: 2});
      return generator
        .prompt({message: 'bar', name: 'foo'})
        .then(function (answers) {
          assert.equal(answers.foo, 2);
        });
    });

    it('throws if answer is not provided', function () {
      const generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, {foo: 1}, {throwOnMissingAnswer: true});
      return this.generator.prompt([{message: 'bar', name: 'notFound'}]).then(
        () => assert.fail(),
        (error) => {
          assert.equal(error.message, 'Answer for notFound was not provided');
        }
      );
    });

    it('keep prompt method asynchronous', function () {
      const spy = sinon.spy();

      const promise = this.generator
        .prompt({name: 'answer', type: 'input'})
        .then(function () {
          sinon.assert.called(spy);
        });

      spy();
      return promise;
    });
  });

  describe('.run()', function () {
    describe('with a generator', function () {
      it('return a RunContext object', function () {
        assert(
          helpers.run(helpers.createDummyGenerator()) instanceof RunContext
        );
      });
    });

    describe('with a namespace', function () {
      it('return a RunContext object', function () {
        const context = helpers.run('simple:app').withEnvironment((env) => {
          helpers.registerDependencies(env, [
            require.resolve('./fixtures/generator-simple/app')
          ]);
        });
        assert(context instanceof RunContext);
      });
    });

    it('pass settings to RunContext', function () {
      const runContext = helpers.run(helpers.createDummyGenerator(), {foo: 1});
      assert.equal(runContext.settings.foo, 1);
    });

    it('pass envOptions to RunContext', function () {
      const envOptions = {foo: 2};
      const runContext = helpers.run(
        helpers.createDummyGenerator(),
        undefined,
        envOptions
      );
      assert.equal(runContext.envOptions, envOptions);
    });

    it('catch env errors', function (done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              this.env.emit('error', new Error());
            }
          }
        )
        .on('error', (_) => {
          done();
        });
    });

    it('catch generator emitted errors', function (done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              this.emit('error', new Error());
            }
          }
        )
        .on('error', (_) => {
          done();
        });
    });

    it('catch generator thrown errors', function (done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              throw new Error('Some error.');
            }
          }
        )
        .on('error', (_) => {
          done();
        });
    });

    // This is a workaround for corner case were an error is not correctly emitted
    // See https://github.com/yeoman/generator/pull/1155
    it('catch run errors', function (done) {
      helpers
        .run(class extends Generator {}, {catchGeneratorError: true})
        .on('error', (_) => {
          done();
        });
    });
  });
});
