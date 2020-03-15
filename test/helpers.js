'use strict';
var util = require('util');
var path = require('path');
var assert = require('assert');
var sinon = require('sinon');
var RunContext = require('../lib/run-context');
var yeoman = require('yeoman-environment');
var Generator = require('yeoman-generator');
var helpers = require('../lib');
var env = yeoman.createEnv();

describe('yeoman-test', function() {
  beforeEach(function() {
    process.chdir(path.join(__dirname, './fixtures'));
    var self = this;

    this.StubGenerator = function(args, options) {
      self.args = args;
      self.options = options;
    };

    util.inherits(this.StubGenerator, Generator);
  });

  describe('.registerDependencies()', function() {
    it('accepts dependency as a path', function() {
      helpers.registerDependencies(env, [
        require.resolve('./fixtures/generator-simple/app')
      ]);
      assert(env.get('simple:app'));
    });

    it('accepts dependency as array of [<generator>, <name>]', function() {
      helpers.registerDependencies(env, [[this.StubGenerator, 'stub:app']]);
      assert(env.get('stub:app'));
    });
  });

  describe('.createGenerator()', function() {
    it('create a new generator', function() {
      var generator = helpers.createGenerator('unicorn:app', [
        [this.StubGenerator, 'unicorn:app']
      ]);

      assert.ok(generator instanceof this.StubGenerator);
    });

    it('pass args params to the generator', function() {
      helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp']
      );

      assert.deepEqual(this.args, ['temp']);
    });

    it('pass options param to the generator', function() {
      helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp'],
        { ui: 'tdd' }
      );

      assert.equal(this.options.ui, 'tdd');
    });
  });

  describe('.mockPrompt()', function() {
    beforeEach(function() {
      this.generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(this.generator, { answer: 'foo' });
    });

    it('uses default values', function() {
      return this.generator
        .prompt([{ name: 'respuesta', type: 'input', default: 'bar' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses default values when no answer is passed', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator);
      return generator
        .prompt([{ name: 'respuesta', message: 'foo', type: 'input', default: 'bar' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('supports `null` answer for `list` type', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());

      helpers.mockPrompt(generator, {
        respuesta: null
      });

      return generator
        .prompt([{ name: 'respuesta', message: 'foo', type: 'list', default: 'bar' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, null);
        });
    });

    it('treats `null` as no answer for `input` type', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());

      helpers.mockPrompt(generator, {
        respuesta: null
      });

      return generator
        .prompt([{ name: 'respuesta', message: 'foo', type: 'input', default: 'bar' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses `true` as the default value for `confirm` type', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, {});

      return generator
        .prompt([{ name: 'respuesta', message: 'foo', type: 'confirm' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, true);
        });
    });

    it('supports `false` answer for `confirm` type', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, { respuesta: false });

      return generator
        .prompt([{ name: 'respuesta', message: 'foo', type: 'confirm' }])
        .then(function(answers) {
          assert.equal(answers.respuesta, false);
        });
    });

    it('prefers mocked values over defaults', function() {
      return this.generator
        .prompt([{ name: 'answer', type: 'input', default: 'bar' }])
        .then(function(answers) {
          assert.equal(answers.answer, 'foo');
        });
    });

    it('can be call multiple time on the same generator', function() {
      var generator = env.instantiate(helpers.createDummyGenerator());
      helpers.mockPrompt(generator, { foo: 1 });
      helpers.mockPrompt(generator, { foo: 2 });
      return generator.prompt({ message: 'bar', name: 'foo' }).then(function(answers) {
        assert.equal(answers.foo, 2);
      });
    });

    it('keep prompt method asynchronous', function() {
      var spy = sinon.spy();

      var promise = this.generator
        .prompt({ name: 'answer', type: 'input' })
        .then(function() {
          sinon.assert.called(spy);
        });

      spy();
      return promise;
    });
  });

  describe('.run()', function() {
    describe('with a generator', function() {
      it('return a RunContext object', function() {
        assert(helpers.run(helpers.createDummyGenerator()) instanceof RunContext);
      });
    });

    describe('with a namespace', function() {
      it('return a RunContext object', function() {
        const context = helpers.run('simple:app').withEnvironment(env => {
          helpers.registerDependencies(env, [
            require.resolve('./fixtures/generator-simple/app')
          ]);
        });
        assert(context instanceof RunContext);
      });
    });

    it('pass settings to RunContext', function() {
      var runContext = helpers.run(helpers.createDummyGenerator(), { foo: 1 });
      assert.equal(runContext.settings.foo, 1);
    });

    it('catch env errors', function(done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              this.env.emit('error', new Error());
            }
          }
        )
        .on('error', _ => {
          done();
        });
    });

    it('catch generator emitted errors', function(done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              this.emit('error', new Error());
            }
          }
        )
        .on('error', _ => {
          done();
        });
    });

    it('catch generator thrown errors', function(done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              throw new Error();
            }
          }
        )
        .on('error', _ => {
          done();
        });
    });

    // This is a workaround for corner case were an error is not correctly emitted
    // See https://github.com/yeoman/generator/pull/1155
    it('catch run errors', function(done) {
      helpers
        .run(class extends Generator {}, { catchGeneratorError: true })
        .on('error', _ => {
          done();
        });
    });
  });
});
