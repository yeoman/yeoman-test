import fs from 'node:fs';
import path, { dirname } from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
import { afterEach, beforeEach, describe, expect, it } from 'esmocha';
import inquirer from 'inquirer';
import Generator from 'yeoman-generator';
import tempDirectory from 'temp-dir';
import { RunContextBase as RunContext } from '../src/run-context.js';
import helpers from '../src/helpers.js';
import { DummyPrompt } from '../src/adapter.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const tmpdir = path.join(tempDirectory, 'yeoman-run-context');

describe('RunContext', function () {
  const envOptions = { foo: 'bar' };
  let ctx: RunContext;
  let execSpy;
  let defaultInput;
  let Dummy;

  beforeEach(function () {
    process.chdir(__dirname);

    defaultInput = inquirer.prompt.input;
    execSpy = mock.fn();
    Dummy = class extends Generator {
      exec(...args) {
        execSpy.apply(this, args);
      }
    };

    ctx = new RunContext(Dummy, undefined, envOptions);
  });

  afterEach(function (done) {
    process.chdir(__dirname);

    if (ctx.settings.tmpdir) {
      ctx.cleanTestDirectory();
    }

    if (ctx.completed || ctx.errored || !ctx.ran) {
      done();
      return;
    }

    try {
      ctx.on('end', done);
    } catch {
      // Ignore error
    }
  });

  describe('constructor', function () {
    it('forwards envOptions to the environment', function (done) {
      ctx.on('ready', function () {
        assert.equal(this.env.options.foo, envOptions.foo);
        done();
      });
    });

    it('accept path parameter', function (done) {
      const ctx = new RunContext(require.resolve('./fixtures/generator-simple/app'));

      ctx
        .on('ready', async function () {
          assert(await ctx.env.get('simple:app'));
        })
        .on('end', done);
    });

    it('propagate generator error events', function (done) {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => undefined,
        () => {
          throw error;
        },
      );
      const endSpy = mock.fn();
      Dummy.prototype.test = execSpy;
      Dummy.prototype.end = execSpy;
      const ctx = new RunContext(Dummy);

      ctx.on('error', function (error_) {
        assert.strictEqual(execSpy.mock.callCount(), 1);
        assert.equal(error_, error);
        assert.strictEqual(endSpy.mock.callCount(), 0);
        done();
      });
    });

    it('accept generator constructor parameter (and assign gen:test as namespace)', function (done) {
      ctx.on('ready', async function () {
        assert(await ctx.env.get('gen:test'));
        done();
      });
    });

    it('set namespace and resolved path in generator', async function () {
      const ctx = new RunContext(Dummy, {
        resolved: 'path',
        namespace: 'simple:app',
      });

      await ctx.build();

      expect(((await ctx.env.get('simple:app')) as any).resolved).toMatch(/^path/);
    });

    it('run the generator asynchronously', function (done) {
      assert.equal(execSpy.mock.callCount(), 0);
      ctx.on('end', function () {
        assert.strictEqual(execSpy.mock.callCount(), 1);
        done();
      });
    });

    it('reset mocked prompt after running', function (done) {
      ctx.on('end', function () {
        assert.equal(defaultInput, inquirer.prompt.input);
        done();
      });
    });

    it('automatically run in a random tmpdir', function (done) {
      ctx.on('end', function () {
        assert.notEqual(process.cwd(), __dirname);
        assert.equal(tempDirectory, path.dirname(process.cwd()));
        done();
      });
    });

    it('allows an option to not automatically run in tmpdir', function (done) {
      const cwd = process.cwd();
      const ctx = new RunContext(Dummy, { cwd, tmpdir: false });
      ctx.on('end', function () {
        assert.equal(cwd, process.cwd());
        done();
      });
    });

    it('throws an error when calling cleanTestDirectory with not tmpdir settings', function () {
      const cwd = process.cwd();
      const ctx = new RunContext(Dummy, { cwd, tmpdir: false });
      try {
        ctx.cleanTestDirectory();
        assert.fail();
      } catch (error) {
        assert(error.message.includes('Cleanup test dir called with false tmpdir option.'));
      }
    });

    it('accepts settings', function () {
      const Dummy = helpers.createDummyGenerator();
      const ctx = new RunContext(Dummy, {
        tmpdir: false,
        resolved: 'path',
        namespace: 'simple:app',
      });
      assert.equal(ctx.settings.tmpdir, false);
      assert.equal(ctx.settings.resolved, 'path');
      assert.equal(ctx.settings.namespace, 'simple:app');
    });

    it('only run a generator once', function (done) {
      ctx.on('end', () => {
        assert.strictEqual(execSpy.mock.callCount(), 1);
        done();
      });

      ctx.setupEventListeners();
      ctx.setupEventListeners();
    });

    it('set --force by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options.force, true);
        done();
      });
    });

    it('set --skip-install by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options.skipInstall, true);
        done();
      });
    });

    it('set --skip-cache by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options.skipCache, true);
        done();
      });
    });
  });

  describe('error handling', function () {
    afterEach(() => {
      process.removeAllListeners('unhandledRejection');
    });

    it('throw an unhandledRejection when no listener is present', function (done) {
      const error = new Error('dummy exception');
      const execSpy = mock.fn(
        () => undefined,
        () => {
          throw error;
        },
      );
      const errorHandler = function (error_) {
        assert.strictEqual(execSpy.mock.callCount(), 1);
        assert.equal(error_, error);
        done();
      };

      process.once('unhandledRejection', errorHandler);

      const Dummy = helpers.createDummyGenerator();
      Dummy.prototype.test = execSpy;

      setImmediate(function () {
        return new RunContext(Dummy).on('end', () => {});
      });
    });
  });

  describe('#toPromise()', function () {
    it('return a resolved promise with the target directory on success', async function () {
      const runResult = await ctx.toPromise();
      assert.equal(ctx.targetDirectory, runResult.cwd);
    });

    it('returns a reject promise on error', async function () {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => undefined,
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const ctx = new RunContext(Dummy);

      return ctx.toPromise().catch(function (error_) {
        assert.equal(error_, error);
      });
    });
  });

  describe('#then()', function () {
    it('handle success', async function () {
      return ctx.toPromise().then(function (runResult) {
        assert.equal(ctx.targetDirectory, runResult.cwd);
      });
    });

    it('handles errors', async function () {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => undefined,
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const ctx = new RunContext(Dummy);

      return ctx.toPromise().then(
        function () {},
        function (error_) {
          assert.equal(error_, error);
        },
      );
    });
  });

  describe('#catch()', function () {
    it('handles errors', async function () {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => undefined,
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const ctx = new RunContext(Dummy);

      return ctx.toPromise().catch(function (error_) {
        assert.equal(error_, error);
      });
    });
  });

  describe('#inDir()', function () {
    beforeEach(function () {
      process.chdir(__dirname);
      this.tmp = tmpdir;
    });

    it('call helpers.testDirectory()', function () {
      const spy = mock.method(helpers, 'testDirectory');
      ctx.inDir(this.tmp);
      assert.equal(spy.mock.calls[0].arguments[0], this.tmp);
      spy.mock.restore();
    });

    it('is chainable', function () {
      assert.equal(ctx.inDir(this.tmp), ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const ctx = new RunContext(Dummy);
      const cb = mock.fn(
        function () {
          assert.strictEqual(cb.mock.callCount(), 1);
          assert.equal(cb.mock.calls[0].this, ctx);
          assert.equal(cb.mock.calls[0].arguments[0], path.resolve(this.tmp));
        }.bind(this),
      );

      ctx.inDir(this.tmp, cb).on('end', done);
    });

    it('throws error at additional calls with dirPath', function () {
      assert(ctx.inDir(this.tmp));
      try {
        ctx.inDir(this.tmp);
        assert.fail();
      } catch (error) {
        assert(error.message.includes('Test directory has already been set.'));
      }
    });
  });

  describe('#doInDir()', function () {
    beforeEach(function () {
      process.chdir(__dirname);
      this.tmp = tmpdir;
    });

    it('accepts `cb` to be invoked with resolved `dir`', function (done) {
      let cbCalled = false;
      ctx
        .inDir(this.tmp)
        .doInDir(dirPath => {
          cbCalled = true;
          assert.equal(dirPath, this.tmp);
        })
        .on('end', () => {
          if (cbCalled) {
            done();
          }
        });
    });

    it('accepts multiples call with `cb` to be invoked with resolved `dir`', function (done) {
      let cbCalled1 = false;
      let cbCalled2 = false;
      ctx
        .inDir(this.tmp)
        .doInDir(dirPath => {
          cbCalled1 = true;
          assert.equal(dirPath, this.tmp);
        })
        .doInDir(dirPath => {
          cbCalled2 = true;
          assert.equal(dirPath, this.tmp);
        })
        .on('end', () => {
          if (cbCalled1 && cbCalled2) {
            done();
          }
        });
    });
  });

  describe('#cd()', function () {
    beforeEach(function () {
      process.chdir(__dirname);
      this.tmp = tmpdir;
      fs.mkdirSync(tmpdir, { recursive: true });
    });

    it('do not call helpers.testDirectory()', function () {
      const spy = mock.method(helpers, 'testDirectory');
      ctx.cd(this.tmp);
      assert.strictEqual(spy.mock.callCount(), 0);
      spy.mock.restore();
    });

    it('is chainable', function () {
      assert.equal(ctx.cd(this.tmp), ctx);
    });

    it('should set inDirSet & targetDirectory', function () {
      assert(!ctx.targetDirectory);
      ctx.cd(this.tmp);
      assert.equal(ctx.targetDirectory, this.tmp);
    });

    it('should cd into created directory', function () {
      const spy = mock.method(process, 'chdir');
      ctx.cd(this.tmp);
      assert.equal(spy.mock.calls[0].arguments[0], this.tmp);
      spy.mock.restore();
    });

    it('should throw error if directory do not exist', function () {
      try {
        ctx.cd(path.join(this.tmp, 'NOT_EXIST'));
        assert.fail();
      } catch (error) {
        assert(error.message.includes(this.tmp));
      }
    });
  });

  describe('#inTmpDir', function () {
    it('call helpers.testDirectory()', function () {
      const spy = mock.method(helpers, 'testDirectory');
      ctx.inTmpDir();
      assert.strictEqual(spy.mock.callCount(), 1);
      spy.mock.restore();
    });

    it('is chainable', function () {
      assert.equal(ctx.inTmpDir(), ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const cb = mock.fn(function (dir) {
        assert.equal(this, ctx);
        assert(dir.includes(tempDirectory));
      });

      ctx.inTmpDir(cb).on('end', done);
    });
  });

  describe('#withArguments()', function () {
    it('provide arguments to the generator when passed as Array', function (done) {
      ctx.withArguments(['one', 'two']);
      ctx.on('end', function () {
        assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['one', 'two']);
        done();
      });
    });

    it('provide arguments to the generator when passed as String', function (done) {
      ctx.withArguments('foo bar');
      ctx.on('end', function () {
        assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['foo', 'bar']);
        done();
      });
    });

    it('throws when arguments passed is neither a String or an Array', function () {
      assert.throws(ctx.withArguments.bind(ctx, { foo: 'bar' }));
    });

    it('is chainable', function (done) {
      ctx.withArguments('foo').withArguments('bar');
      ctx.on('end', function () {
        assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['foo', 'bar']);
        done();
      });
    });
  });

  describe('#withOptions()', function () {
    it('provide options to the generator', function (done) {
      ctx.withOptions({ foo: 'bar' });
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options.foo, 'bar');
        done();
      });
    });

    it('allow default settings to be overriden', function (done) {
      ctx.withOptions({
        'skip-install': false,
        force: false,
      });
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options.skipInstall, false);
        assert.equal(execSpy.mock.calls[0].this.options.force, false);
        done();
      });
    });

    it('camel case options', function (done) {
      ctx.withOptions({ 'foo-bar': false });
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options['foo-bar'], false);
        assert.equal(execSpy.mock.calls[0].this.options.fooBar, false);
        done();
      });
    });

    it('kebab case options', function (done) {
      ctx.withOptions({ barFoo: false });
      ctx.on('end', function () {
        assert.equal(execSpy.mock.calls[0].this.options['bar-foo'], false);
        assert.equal(execSpy.mock.calls[0].this.options.barFoo, false);
        done();
      });
    });

    it('is chainable', function (done) {
      ctx.withOptions({ foo: 'bar' }).withOptions({ john: 'doe' });
      ctx.on('end', function () {
        const { options } = execSpy.mock.calls[0].this;
        assert.equal(options.foo, 'bar');
        assert.equal(options.john, 'doe');
        done();
      });
    });
  });

  describe('#withAnswers()', function () {
    it('is call automatically', async function () {
      const askFor = mock.fn();
      const prompt = mock.fn();
      Dummy.prototype.askFor = function () {
        askFor();
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
          default: 'pass',
        }).then(function (answers) {
          assert.equal(answers.yeoman, 'pass');
          prompt();
        });
      };

      return ctx.toPromise().then(function () {
        assert.strictEqual(askFor.mock.callCount(), 1);
        assert.strictEqual(prompt.mock.callCount(), 1);
      });
    });

    it('mock the prompt', async function () {
      const execSpy = mock.fn();
      Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(function (answers) {
          assert.equal(answers.yeoman, 'yes please');
          execSpy();
        });
      };

      return ctx
        .withAnswers({ yeoman: 'yes please' })
        .toPromise()
        .then(function () {
          assert.strictEqual(execSpy.mock.callCount(), 1);
        });
    });

    it('is chainable', async function () {
      const execSpy = mock.fn();
      Dummy.prototype.askFor = function () {
        return this.prompt([
          {
            name: 'yeoman',
            type: 'input',
            message: 'Hey!',
          },
          {
            name: 'yo',
            type: 'input',
            message: 'Yo!',
          },
        ]).then(function (answers) {
          execSpy();
          assert.equal(answers.yeoman, 'yes please');
          assert.equal(answers.yo, 'yo man');
        });
      };

      return ctx
        .withAnswers({ yeoman: 'yes please' })
        .withAnswers({ yo: 'yo man' })
        .toPromise()
        .then(function () {
          assert.strictEqual(execSpy.mock.callCount(), 1);
        });
    });

    it('calls the callback', async function () {
      const execSpy = mock.fn();
      const promptSpy = mock.fn(
        () => undefined,
        () => 'yes please',
      );
      Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(function (answers) {
          execSpy();
          assert.equal(answers.yeoman, 'yes please');
        });
      };

      return ctx
        .withAnswers({ yeoman: 'no please' }, { callback: promptSpy })
        .toPromise()
        .then(function () {
          assert.strictEqual(execSpy.mock.callCount(), 1);
          assert.strictEqual(promptSpy.mock.callCount(), 1);
          assert.equal(promptSpy.mock.calls[0].arguments[0], 'no please');
          assert.ok(promptSpy.mock.calls[0].this instanceof DummyPrompt);
        });
    });

    it('sets askedQuestions', async function () {
      Dummy.prototype.askFor = function () {
        return this.prompt([
          {
            name: 'yeoman',
            type: 'input',
            message: 'Hey!',
          },
          {
            name: 'yeoman2',
            type: 'input',
            message: 'Hey!',
          },
        ]);
      };

      const result = await ctx.withAnswers({ yeoman: 'no please' }).toPromise();

      assert.deepEqual(result.askedQuestions, [
        { name: 'yeoman', answer: 'no please' },
        { name: 'yeoman2', answer: undefined },
      ]);
    });
  });

  describe('#withMockedGenerators()', function () {
    it('creates mocked generator', async function () {
      await ctx.withMockedGenerators(['foo:bar']).build();
      assert(await ctx.env.get('foo:bar'));
      assert(ctx.mockedGenerators['foo:bar']);
    });
  });

  describe('#withGenerators()', function () {
    it('register paths', function (done) {
      ctx.withGenerators([require.resolve('./fixtures/generator-simple/app')]).on('ready', async function () {
        assert(await ctx.env.get('simple:app'));
        done();
      });
    });

    it('register paths with namespaces', async function () {
      await ctx.withGenerators([[require.resolve('./fixtures/generator-simple/app'), { namespace: 'foo:bar' }]]).build();
      assert(await ctx.env.get('foo:bar'));
    });

    it('register mocked generator', function (done) {
      ctx.withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]]).on('ready', async function () {
        assert(await ctx.env.get('dummy:gen'));
        done();
      });
    });

    it('allow multiple calls', function (done) {
      ctx
        .withGenerators([require.resolve('./fixtures/generator-simple/app')])
        .withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]])
        .on('ready', async function () {
          assert(await ctx.env.get('dummy:gen'));
          assert(await ctx.env.get('simple:app'));
          done();
        });
    });
  });

  describe('#withSpawnMock()', function () {
    it('provide arguments to the generator when passed as String', async function () {
      ctx.withSpawnMock();
      Dummy.prototype.mockTask = async function () {
        const spawnCommandFoo = this.spawnCommand('foo');
        expect(spawnCommandFoo).toMatchObject({ stderr: expect.any(Object), stdout: expect.any(Object) });
        await expect(spawnCommandFoo).resolves.toMatchObject({ exitCode: 0, stderr: '', stdout: '' });

        expect(this.spawnCommandSync('foo')).toMatchObject({ exitCode: 0, stderr: '', stdout: '' });

        const spawnFoo = this.spawn('foo');
        expect(spawnFoo).toMatchObject({ stderr: expect.any(Object), stdout: expect.any(Object) });
        await expect(spawnFoo).resolves.toMatchObject({ exitCode: 0, stderr: '', stdout: '' });

        expect(this.spawnSync('foo')).toMatchObject({ exitCode: 0, stderr: '', stdout: '' });
      };

      const result = await ctx.toPromise();
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[0], ['spawnCommand', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[1], ['spawnCommandSync', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[2], ['spawn', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[3], ['spawnSync', 'foo']);
    });

    it('with callback', async function () {
      ctx.withSpawnMock<ReturnType<typeof mock.fn>>({
        stub: mock.fn(),
        registerNodeMockDefaults: true,
        callback({ stub, implementation }) {
          const newImplementation = (...args) => {
            const [first, second] = args;
            if (first === 'spawnCommandSync' && second === 'foo') {
              return 'bar';
            }
            return implementation(...args);
          };
          stub.mock.mockImplementation(newImplementation);
        },
      });

      Dummy.prototype.mockTask = async function () {
        expect(this.spawnCommandSync()).toMatchObject({ exitCode: 0, stderr: '', stdout: '' });
        expect(this.spawnCommandSync('foo')).toBe('bar');
      };

      await ctx.toPromise();
    });

    it('without defaults', async function () {
      ctx.withSpawnMock({
        stub: mock.fn(),
        registerNodeMockDefaults: false,
      });

      Dummy.prototype.mockTask = async function () {
        expect(this.spawnCommandSync()).toBeUndefined();
      };

      await ctx.toPromise();
    });
  });

  describe('#withEnvironment()', function () {
    it('register paths', function (done) {
      ctx
        .withEnvironment(env => {
          env.register(require.resolve('./fixtures/generator-simple/app'));
          return env;
        })
        .on('ready', async function () {
          assert(await ctx.env.get('simple:app'));
          done();
        });
    });
  });

  describe('#withLocalConfig()', function () {
    it('provides config to the generator', function (done) {
      ctx
        .withLocalConfig({
          some: true,
          data: 'here',
        })
        .on('ready', function () {
          assert.equal(ctx.generator.config.get('some'), true);
          assert.equal(ctx.generator.config.get('data'), 'here');
          done();
        });
    });
  });

  describe('#_createRunResultOptions()', function () {
    it('creates RunResult configuration', function (done) {
      ctx
        .withLocalConfig({
          some: true,
          data: 'here',
        })
        .on('ready', function () {
          const options = ctx._createRunResultOptions();
          assert.equal(options.env, ctx.env);
          assert.equal(options.memFs, ctx.env.sharedFs);
          assert.equal(options.oldCwd, ctx.oldCwd);
          assert.equal(options.cwd, ctx.targetDirectory);
          assert.equal(options.envOptions, ctx.envOptions);
          assert.equal(options.mockedGenerators, ctx.mockedGenerators);
          assert.deepEqual(options.settings, ctx.settings);
          done();
        });
    });
  });
});
