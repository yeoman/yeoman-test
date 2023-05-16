import fs from 'node:fs';
import path, { dirname } from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
import { assert as sinonAssert, spy as sinonSpy, stub as sinonStub, fake as sinonFake } from 'sinon';
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
    execSpy = sinonSpy();
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
    } catch {}
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
        .on('ready', function () {
          assert(ctx.env.get('simple:app'));
        })
        .on('end', done);
    });

    it('propagate generator error events', function (done) {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = sinonStub().throws(error);
      const endSpy = sinonSpy();
      Dummy.prototype.test = execSpy;
      Dummy.prototype.end = execSpy;
      const ctx = new RunContext(Dummy);

      ctx.on('error', function (error_) {
        sinonAssert.calledOnce(execSpy);
        assert.equal(error_, error);
        sinonAssert.notCalled(endSpy);
        done();
      });
    });

    it('accept generator constructor parameter (and assign gen:test as namespace)', function (done) {
      ctx.on('ready', function () {
        assert(ctx.env.get('gen:test'));
        done();
      });
    });

    it('set namespace and resolved path in generator', function (done) {
      const ctx = new RunContext(Dummy, {
        resolved: 'path',
        namespace: 'simple:app',
      });

      ctx.on('ready', async function () {
        assert.equal(((await ctx.env.get('simple:app')) as any).resolved, 'path');
        done();
      });
    });

    it('run the generator asynchronously', function (done) {
      assert(execSpy.notCalled);
      ctx.on('end', function () {
        sinonAssert.calledOnce(execSpy);
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
        sinonAssert.calledOnce(execSpy);
        done();
      });

      ctx.setupEventListeners();
      ctx.setupEventListeners();
    });

    it('set --force by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options.force, true);
        done();
      });
    });

    it('set --skip-install by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options.skipInstall, true);
        done();
      });
    });

    it('set --skip-cache by default', function (done) {
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options.skipCache, true);
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
      const execSpy = sinonStub().throws(error);
      const errorHandler = function (error_) {
        sinonAssert.calledOnce(execSpy);
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
      const execSpy = sinonStub().throws(error);
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
      const execSpy = sinonStub().throws(error);
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
      const execSpy = sinonStub().throws(error);
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
      const spy = sinonSpy(helpers, 'testDirectory');
      ctx.inDir(this.tmp);
      assert(spy.withArgs(this.tmp).calledOnce);
      spy.restore();
    });

    it('is chainable', function () {
      assert.equal(ctx.inDir(this.tmp), ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const ctx = new RunContext(Dummy);
      const cb = sinonSpy(
        function () {
          sinonAssert.calledOnce(cb);
          sinonAssert.calledOn(cb, ctx);
          sinonAssert.calledWith(cb, path.resolve(this.tmp));
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
      const spy = sinonSpy(helpers, 'testDirectory');
      ctx.cd(this.tmp);
      assert(!spy.calledOnce);
      spy.restore();
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
      const spy = sinonSpy(process, 'chdir');
      ctx.cd(this.tmp);
      assert(spy.calledWith(this.tmp));
      spy.restore();
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
      const spy = sinonSpy(helpers, 'testDirectory');
      ctx.inTmpDir();
      sinonAssert.calledOnce(spy);
      spy.restore();
    });

    it('is chainable', function () {
      assert.equal(ctx.inTmpDir(), ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const cb = sinonSpy(function (dir) {
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
        assert.deepEqual(execSpy.firstCall.thisValue.arguments, ['one', 'two']);
        done();
      });
    });

    it('provide arguments to the generator when passed as String', function (done) {
      ctx.withArguments('foo bar');
      ctx.on('end', function () {
        assert.deepEqual(execSpy.firstCall.thisValue.arguments, ['foo', 'bar']);
        done();
      });
    });

    it('throws when arguments passed is neither a String or an Array', function () {
      assert.throws(ctx.withArguments.bind(ctx, { foo: 'bar' }));
    });

    it('is chainable', function (done) {
      ctx.withArguments('foo').withArguments('bar');
      ctx.on('end', function () {
        assert.deepEqual(execSpy.firstCall.thisValue.arguments, ['foo', 'bar']);
        done();
      });
    });
  });

  describe('#withOptions()', function () {
    it('provide options to the generator', function (done) {
      ctx.withOptions({ foo: 'bar' });
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options.foo, 'bar');
        done();
      });
    });

    it('allow default settings to be overriden', function (done) {
      ctx.withOptions({
        'skip-install': false,
        force: false,
      });
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options.skipInstall, false);
        assert.equal(execSpy.firstCall.thisValue.options.force, false);
        done();
      });
    });

    it('camel case options', function (done) {
      ctx.withOptions({ 'foo-bar': false });
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options['foo-bar'], false);
        assert.equal(execSpy.firstCall.thisValue.options.fooBar, false);
        done();
      });
    });

    it('kebab case options', function (done) {
      ctx.withOptions({ barFoo: false });
      ctx.on('end', function () {
        assert.equal(execSpy.firstCall.thisValue.options['bar-foo'], false);
        assert.equal(execSpy.firstCall.thisValue.options.barFoo, false);
        done();
      });
    });

    it('is chainable', function (done) {
      ctx.withOptions({ foo: 'bar' }).withOptions({ john: 'doe' });
      ctx.on('end', function () {
        const { options } = execSpy.firstCall.thisValue;
        assert.equal(options.foo, 'bar');
        assert.equal(options.john, 'doe');
        done();
      });
    });
  });

  describe('#withPrompts()', function () {
    it('is call automatically', async function () {
      const askFor = sinonSpy();
      const prompt = sinonSpy();
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
        sinonAssert.calledOnce(askFor);
        sinonAssert.calledOnce(prompt);
      });
    });

    it('mock the prompt', async function () {
      const execSpy = sinonSpy();
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
        .withPrompts({ yeoman: 'yes please' })
        .toPromise()
        .then(function () {
          sinonAssert.calledOnce(execSpy);
        });
    });

    it('is chainable', async function () {
      const execSpy = sinonSpy();
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
        .withPrompts({ yeoman: 'yes please' })
        .withPrompts({ yo: 'yo man' })
        .toPromise()
        .then(function () {
          sinonAssert.calledOnce(execSpy);
        });
    });

    it('calls the callback', async function () {
      const execSpy = sinonSpy();
      const promptSpy = sinonFake.returns('yes please');
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
        .withPrompts({ yeoman: 'no please' }, promptSpy)
        .toPromise()
        .then(function () {
          sinonAssert.calledOnce(execSpy);
          sinonAssert.calledOnce(promptSpy);
          assert.equal(promptSpy.getCall(0).args[0], 'no please');
          assert.ok(promptSpy.getCall(0).thisValue instanceof DummyPrompt);
        });
    });
  });

  describe('#withMockedGenerators()', function () {
    it('creates mocked generator', async function () {
      await ctx.withMockedGenerators(['foo:bar']).build();
      assert(ctx.env.get('foo:bar'));
      assert(ctx.mockedGenerators['foo:bar']);
    });
  });

  describe('#withGenerators()', function () {
    it('register paths', function (done) {
      ctx.withGenerators([require.resolve('./fixtures/generator-simple/app')]).on('ready', function () {
        assert(ctx.env.get('simple:app'));
        done();
      });
    });

    it('register paths with namespaces', async function () {
      await ctx.withGenerators([[require.resolve('./fixtures/generator-simple/app'), { namespace: 'foo:bar' }]]).build();
      assert(ctx.env.get('foo:bar'));
    });

    it('register mocked generator', function (done) {
      ctx.withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]]).on('ready', function () {
        assert(ctx.env.get('dummy:gen'));
        done();
      });
    });

    it('allow multiple calls', function (done) {
      ctx
        .withGenerators([require.resolve('./fixtures/generator-simple/app')])
        .withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]])
        .on('ready', function () {
          assert(ctx.env.get('dummy:gen'));
          assert(ctx.env.get('simple:app'));
          done();
        });
    });
  });

  describe('#withEnvironment()', function () {
    it('register paths', function (done) {
      ctx
        .withEnvironment(env => {
          env.register(require.resolve('./fixtures/generator-simple/app'));
          return env;
        })
        .on('ready', function () {
          assert(ctx.env.get('simple:app'));
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
