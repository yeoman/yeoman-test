import assert from 'node:assert';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {createRequire} from 'node:module';
import {assert as sinonAssert, spy as sinonSpy, stub as sinonStub} from 'sinon';
import yeoman from 'yeoman-environment';
import Generator from 'yeoman-generator';
import {jestExpect as expect} from 'mocha-expect-snapshot';

import type Environment from 'yeoman-environment';
import helpers from '../src/helpers.js';
import {TestAdapter} from '../src/adapter.js';
import RunContext from '../src/run-context.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const {resolve, join} = path;
const env = yeoman.createEnv(undefined, undefined, new TestAdapter() as any);

describe('yeoman-test', function () {
  beforeEach(function () {
    process.chdir(path.join(__dirname, './fixtures'));

    this.StubGenerator = class extends Generator {};
  });

  describe('.registerDependencies()', function () {
    it('accepts dependency as a path', function () {
      helpers.registerDependencies(env, [
        require.resolve('./fixtures/generator-simple/app'),
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
        [this.StubGenerator, 'unicorn:app'],
      ]);

      assert.ok(generator instanceof this.StubGenerator);
    });

    it('pass args params to the generator', function () {
      const generator = helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp'],
      );

      assert.deepEqual(generator.args, ['temp']);
    });

    it('pass options param to the generator', function () {
      const generator = helpers.createGenerator(
        'unicorn:app',
        [[this.StubGenerator, 'unicorn:app']],
        ['temp'],
        {ui: 'tdd'},
      );

      assert.equal(generator.options.ui, 'tdd');
    });
  });

  describe('.mockPrompt()', function () {
    beforeEach(function () {
      this.generator = env.instantiate(helpers.createDummyGenerator(), [], {});
      helpers.mockPrompt(this.generator, {answer: 'foo'});
    });

    it('uses default values', function () {
      return this.generator
        .prompt([{name: 'respuesta', type: 'input', default: 'bar'}])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses default values when no answer is passed', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});
      helpers.mockPrompt(generator);
      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'input', default: 'bar'},
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('supports `null` answer for `list` type', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});

      helpers.mockPrompt(generator, {
        respuesta: null,
      });

      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'list', default: 'bar'},
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, null);
        });
    });

    it('treats `null` as no answer for `input` type', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});

      helpers.mockPrompt(generator, {
        respuesta: null,
      });

      return generator
        .prompt([
          {name: 'respuesta', message: 'foo', type: 'input', default: 'bar'},
        ])
        .then(function (answers) {
          assert.equal(answers.respuesta, 'bar');
        });
    });

    it('uses `true` as the default value for `confirm` type', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});
      helpers.mockPrompt(generator, {});

      return generator
        .prompt([{name: 'respuesta', message: 'foo', type: 'confirm'}])
        .then(function (answers) {
          assert.equal(answers.respuesta, true);
        });
    });

    it('supports `false` answer for `confirm` type', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});
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

    it('can be call multiple time on the same generator', async function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});
      helpers.mockPrompt(generator, {foo: 1});
      helpers.mockPrompt(generator, {foo: 2});
      return generator
        .prompt({message: 'bar', name: 'foo'})
        .then(function (answers) {
          assert.equal(answers.foo, 2);
        });
    });

    it('throws if answer is not provided', function () {
      const generator = env.instantiate(helpers.createDummyGenerator(), [], {});
      helpers.mockPrompt(generator, {foo: 1}, {throwOnMissingAnswer: true});
      return this.generator.prompt([{message: 'bar', name: 'notFound'}]).then(
        () => assert.fail(),
        (error) => {
          assert.equal(
            error.message,
            'yeoman-test: question notFound was asked but answer was not provided',
          );
        },
      );
    });

    it('keep prompt method asynchronous', function () {
      const spy = sinonSpy();

      const promise = this.generator
        .prompt({name: 'answer', type: 'input'})
        .then(function () {
          sinonAssert.called(spy);
        });

      spy();
      return promise;
    });
  });

  describe('.run()', function () {
    describe('with a generator', function () {
      it('return a RunContext object', function (done) {
        const context = helpers.run(helpers.createDummyGenerator());
        assert(context instanceof RunContext);
        context.on('end', done);
      });
    });

    describe('with a namespace', function () {
      it('return a RunContext object', function (done) {
        const context = helpers.run('simple:app').withEnvironment((env) => {
          helpers.registerDependencies(env, [
            require.resolve('./fixtures/generator-simple/app'),
          ]);
        });
        assert(context instanceof RunContext);
        context.on('end', done);
      });
    });

    it('pass settings to RunContext', function () {
      const runContext = helpers.run(helpers.createDummyGenerator(), {
        namespace: 'foo',
      });
      assert.equal(runContext.settings.namespace, 'foo');
    });

    it('pass envOptions to RunContext', function () {
      const envOptions = {foo: 2};
      const runContext = helpers.run(
        helpers.createDummyGenerator(),
        undefined,
        envOptions,
      );
      assert.equal(runContext.envOptions, envOptions);
    });

    it('catch env errors', function (done) {
      helpers
        .run(
          class extends helpers.createDummyGenerator() {
            throws() {
              this.env.emit('error', new Error('an error'));
            }
          },
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
              this.emit('error', new Error('an error'));
            }
          },
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
          },
        )
        .on('error', (_) => {
          done();
        });
    });

    // This is a workaround for corner case were an error is not correctly emitted
    // See https://github.com/yeoman/generator/pull/1155
    it('catch run errors', function (done) {
      helpers
        .run(class extends Generator {}, {}, {catchGeneratorError: true})
        .on('error', (_) => {
          done();
        });
    });

    describe('with files', function () {
      it('write files to mem-fs', async function () {
        const runResult = await helpers
          .run(helpers.createDummyGenerator())
          .withFiles({'foo.txt': 'foo', 'foo.json': {foo: 'bar'}});
        expect(runResult.getSnapshot()).toMatchInlineSnapshot(`
          {
            "foo.json": {
              "contents": "{
            "foo": "bar"
          }
          ",
              "stateCleared": "modified",
            },
            "foo.txt": {
              "contents": "foo",
              "stateCleared": "modified",
            },
          }
        `);
      });
    });

    describe('callbacks', function () {
      it('calls in order', async function () {
        const order: string[] = [];

        const runContext = helpers.run(helpers.createDummyGenerator());
        await runContext
          .onReady(function () {
            assert.strictEqual(this, runContext);
            order.push('onReady 0');
          })
          .onReady(function () {
            assert.strictEqual(this, runContext);
            order.push('onReady 1');
          })
          .onTargetDirectory(function () {
            assert.strictEqual(this, runContext);
            order.push('onTargetDir 0');
          })
          .onTargetDirectory(function () {
            assert.strictEqual(this, runContext);
            order.push('onTargetDir 1');
          });

        assert.deepStrictEqual(order, [
          'onTargetDir 0',
          'onTargetDir 1',
          'onReady 0',
          'onReady 1',
        ]);
      });
    });
  });

  describe('.createTestEnv', () => {
    let mockedCreateEnv;
    const createEnvReturn = {};
    beforeEach(() => {
      mockedCreateEnv = sinonStub(helpers, 'createEnv').returns(
        createEnvReturn as Environment,
      );
    });
    afterEach(() => {
      mockedCreateEnv.restore();
    });
    it('calls mocked createEnv', () => {
      assert.equal(helpers.createTestEnv(), createEnvReturn);
      assert.ok(mockedCreateEnv.calledOnce);
    });
    it('calls mocked createEnv with newErrorHandler option', () => {
      assert.equal(helpers.createTestEnv(), createEnvReturn);
      assert.equal(mockedCreateEnv.getCall(0).args[1].newErrorHandler, true);
    });
    it('calls mocked createEnv with sharedOptions.localConfigOnly option', () => {
      assert.equal(helpers.createTestEnv(), createEnvReturn);
      assert.equal(
        mockedCreateEnv.getCall(0).args[1].sharedOptions.localConfigOnly,
        true,
      );
    });
  });
});
