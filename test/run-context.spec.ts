import fs from 'node:fs';
import path, {dirname} from 'node:path';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {createRequire} from 'node:module';
import {
  assert as sinonAssert,
  spy as sinonSpy,
  stub as sinonStub,
  fake as sinonFake,
} from 'sinon';
import inquirer from 'inquirer';
import Generator from 'yeoman-generator';
import tempDirectory from 'temp-dir';

import {RunContextBase as RunContext} from '../src/run-context.js';
import helpers from '../src/helpers.js';
import {DummyPrompt} from '../src/adapter.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const tmpdir = path.join(tempDirectory, 'yeoman-run-context');

describe('RunContext', function () {
  const envOptions = {foo: 'bar'};

  beforeEach(function () {
    process.chdir(__dirname);

    this.defaultInput = inquirer.prompts.input;
    this.execSpy = sinonSpy();
    const {execSpy} = this;
    this.Dummy = class extends Generator {
      exec(...args) {
        execSpy.apply(this, args);
      }
    };

    this.ctx = new RunContext(this.Dummy, undefined, envOptions);
  });

  afterEach(function (done) {
    process.chdir(__dirname);

    if (this.ctx.settings.tmpdir) {
      this.ctx.cleanTestDirectory();
    }

    if (this.ctx.completed || this.ctx.errored) {
      done();
      return;
    }

    this.ctx.on('end', done);
  });

  describe('constructor', function () {
    it('forwards envOptions to the environment', function (done) {
      this.ctx.on('ready', function () {
        assert.equal(this.env.options.foo, envOptions.foo);
        done();
      });
    });

    it('accept path parameter', function (done) {
      const ctx = new RunContext(
        require.resolve('./fixtures/generator-simple/app'),
      );

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
      (Dummy.prototype as any).test = execSpy;
      (Dummy.prototype as any).end = execSpy;
      const ctx = new RunContext(Dummy);

      ctx.on('error', function (error_) {
        sinonAssert.calledOnce(execSpy);
        assert.equal(error_, error);
        sinonAssert.notCalled(endSpy);
        done();
      });
    });

    it('accept generator constructor parameter (and assign gen:test as namespace)', function (done) {
      this.ctx.on(
        'ready',
        function () {
          assert(this.ctx.env.get('gen:test'));
          done();
        }.bind(this),
      );
    });

    it('set namespace and resolved path in generator', function (done) {
      const ctx = new RunContext(this.Dummy, {
        resolved: 'path',
        namespace: 'simple:app',
      });

      ctx.on('ready', function () {
        assert.equal((ctx.env.get('simple:app') as any).resolved, 'path');
        done();
      });
    });

    it('run the generator asynchronously', function (done) {
      assert(this.execSpy.notCalled);
      this.ctx.on(
        'end',
        function () {
          sinonAssert.calledOnce(this.execSpy);
          done();
        }.bind(this),
      );
    });

    it('reset mocked prompt after running', function (done) {
      this.ctx.on(
        'end',
        function () {
          assert.equal(this.defaultInput, inquirer.prompts.input);
          done();
        }.bind(this),
      );
    });

    it('automatically run in a random tmpdir', function (done) {
      this.ctx.on('end', function () {
        assert.notEqual(process.cwd(), __dirname);
        assert.equal(tempDirectory, path.dirname(process.cwd()));
        done();
      });
    });

    it('allows an option to not automatically run in tmpdir', function (done) {
      const cwd = process.cwd();
      const ctx = new RunContext(this.Dummy, {cwd, tmpdir: false});
      ctx.on('end', function () {
        assert.equal(cwd, process.cwd());
        done();
      });
    });

    it('throws an error when calling cleanTestDirectory with not tmpdir settings', function () {
      const cwd = process.cwd();
      const ctx = new RunContext(this.Dummy, {cwd, tmpdir: false});
      try {
        ctx.cleanTestDirectory();
        assert.fail();
      } catch (error) {
        assert(
          error.message.includes(
            'Cleanup test dir called with false tmpdir option.',
          ),
        );
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
      this.ctx.on('end', () => {
        sinonAssert.calledOnce(this.execSpy);
        done();
      });

      this.ctx.setupEventListeners();
      this.ctx.setupEventListeners();
    });

    it('set --force by default', function (done) {
      this.ctx.on(
        'end',
        function () {
          assert.equal(this.execSpy.firstCall.thisValue.options.force, true);
          done();
        }.bind(this),
      );
    });

    it('set --skip-install by default', function (done) {
      this.ctx.on(
        'end',
        function () {
          assert.equal(
            this.execSpy.firstCall.thisValue.options.skipInstall,
            true,
          );
          done();
        }.bind(this),
      );
    });

    it('set --skip-cache by default', function (done) {
      this.ctx.on(
        'end',
        function () {
          assert.equal(
            this.execSpy.firstCall.thisValue.options.skipCache,
            true,
          );
          done();
        }.bind(this),
      );
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
      (Dummy.prototype as any).test = execSpy;

      setImmediate(function () {
        return new RunContext(Dummy).on('end', () => {});
      });
    });
  });

  describe('#toPromise()', function () {
    it('return a resolved promise with the target directory on success', async function () {
      const runResult = await this.ctx.toPromise();
      assert.equal(this.ctx.targetDirectory, runResult.cwd);
    });

    it('returns a reject promise on error', async function () {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = sinonStub().throws(error);
      (Dummy.prototype as any).test = execSpy;
      const ctx = new RunContext(Dummy);

      return ctx.toPromise().catch(function (error_) {
        assert.equal(error_, error);
      });
    });
  });

  describe('#then()', function () {
    it('handle success', function () {
      return this.ctx.toPromise().then(
        function (runResult) {
          assert.equal(this.ctx.targetDirectory, runResult.cwd);
        }.bind(this),
      );
    });

    it('handles errors', async function () {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = sinonStub().throws(error);
      (Dummy.prototype as any).test = execSpy;
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
      (Dummy.prototype as any).test = execSpy;
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
      this.ctx.inDir(this.tmp);
      assert(spy.withArgs(this.tmp).calledOnce);
      spy.restore();
    });

    it('is chainable', function () {
      assert.equal(this.ctx.inDir(this.tmp), this.ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const ctx = new RunContext(this.Dummy);
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
      assert(this.ctx.inDir(this.tmp));
      try {
        this.ctx.inDir(this.tmp);
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
      this.ctx
        .inDir(this.tmp)
        .doInDir((dirPath) => {
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
      this.ctx
        .inDir(this.tmp)
        .doInDir((dirPath) => {
          cbCalled1 = true;
          assert.equal(dirPath, this.tmp);
        })
        .doInDir((dirPath) => {
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
      fs.mkdirSync(tmpdir, {recursive: true});
    });

    it('do not call helpers.testDirectory()', function () {
      const spy = sinonSpy(helpers, 'testDirectory');
      this.ctx.cd(this.tmp);
      assert(!spy.calledOnce);
      spy.restore();
    });

    it('is chainable', function () {
      assert.equal(this.ctx.cd(this.tmp), this.ctx);
    });

    it('should set inDirSet & targetDirectory', function () {
      assert(!this.ctx.targetDirectory);
      this.ctx.cd(this.tmp);
      assert.equal(this.ctx.targetDirectory, this.tmp);
    });

    it('should cd into created directory', function () {
      const spy = sinonSpy(process, 'chdir');
      this.ctx.cd(this.tmp);
      assert(spy.calledWith(this.tmp));
      spy.restore();
    });

    it('should throw error if directory do not exist', function () {
      try {
        this.ctx.cd(path.join(this.tmp, 'NOT_EXIST'));
        assert.fail();
      } catch (error) {
        assert(error.message.includes(this.tmp));
      }
    });
  });

  describe('#inTmpDir', function () {
    it('call helpers.testDirectory()', function () {
      const spy = sinonSpy(helpers, 'testDirectory');
      this.ctx.inTmpDir();
      sinonAssert.calledOnce(spy);
      spy.restore();
    });

    it('is chainable', function () {
      assert.equal(this.ctx.inTmpDir(), this.ctx);
    });

    it('accepts optional `cb` to be invoked with resolved `dir`', function (done) {
      const {ctx} = this;
      const cb = sinonSpy(function (dir) {
        assert.equal(this, ctx);
        assert(dir.includes(tempDirectory));
      });

      this.ctx.inTmpDir(cb).on('end', done);
    });
  });

  describe('#withArguments()', function () {
    it('provide arguments to the generator when passed as Array', function (done) {
      this.ctx.withArguments(['one', 'two']);
      this.ctx.on(
        'end',
        function () {
          assert.deepEqual(this.execSpy.firstCall.thisValue.arguments, [
            'one',
            'two',
          ]);
          done();
        }.bind(this),
      );
    });

    it('provide arguments to the generator when passed as String', function (done) {
      this.ctx.withArguments('foo bar');
      this.ctx.on(
        'end',
        function () {
          assert.deepEqual(this.execSpy.firstCall.thisValue.arguments, [
            'foo',
            'bar',
          ]);
          done();
        }.bind(this),
      );
    });

    it('throws when arguments passed is neither a String or an Array', function () {
      assert.throws(this.ctx.withArguments.bind(this.ctx, {foo: 'bar'}));
    });

    it('is chainable', function (done) {
      this.ctx.withArguments('foo').withArguments('bar');
      this.ctx.on(
        'end',
        function () {
          assert.deepEqual(this.execSpy.firstCall.thisValue.arguments, [
            'foo',
            'bar',
          ]);
          done();
        }.bind(this),
      );
    });
  });

  describe('#withOptions()', function () {
    it('provide options to the generator', function (done) {
      this.ctx.withOptions({foo: 'bar'});
      this.ctx.on(
        'end',
        function () {
          assert.equal(this.execSpy.firstCall.thisValue.options.foo, 'bar');
          done();
        }.bind(this),
      );
    });

    it('allow default settings to be overriden', function (done) {
      this.ctx.withOptions({
        'skip-install': false,
        force: false,
      });
      this.ctx.on(
        'end',
        function () {
          assert.equal(
            this.execSpy.firstCall.thisValue.options.skipInstall,
            false,
          );
          assert.equal(this.execSpy.firstCall.thisValue.options.force, false);
          done();
        }.bind(this),
      );
    });

    it('camel case options', function (done) {
      this.ctx.withOptions({'foo-bar': false});
      this.ctx.on(
        'end',
        function () {
          assert.equal(
            this.execSpy.firstCall.thisValue.options['foo-bar'],
            false,
          );
          assert.equal(this.execSpy.firstCall.thisValue.options.fooBar, false);
          done();
        }.bind(this),
      );
    });

    it('kebab case options', function (done) {
      this.ctx.withOptions({barFoo: false});
      this.ctx.on(
        'end',
        function () {
          assert.equal(
            this.execSpy.firstCall.thisValue.options['bar-foo'],
            false,
          );
          assert.equal(this.execSpy.firstCall.thisValue.options.barFoo, false);
          done();
        }.bind(this),
      );
    });

    it('is chainable', function (done) {
      this.ctx.withOptions({foo: 'bar'}).withOptions({john: 'doe'});
      this.ctx.on(
        'end',
        function () {
          const {options} = this.execSpy.firstCall.thisValue;
          assert.equal(options.foo, 'bar');
          assert.equal(options.john, 'doe');
          done();
        }.bind(this),
      );
    });
  });

  describe('#withPrompts()', function () {
    it('is call automatically', function () {
      const askFor = sinonSpy();
      const prompt = sinonSpy();
      this.Dummy.prototype.askFor = function () {
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

      return this.ctx.toPromise().then(function () {
        sinonAssert.calledOnce(askFor);
        sinonAssert.calledOnce(prompt);
      });
    });

    it('mock the prompt', function () {
      const execSpy = sinonSpy();
      this.Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(function (answers) {
          assert.equal(answers.yeoman, 'yes please');
          execSpy();
        });
      };

      return this.ctx
        .withPrompts({yeoman: 'yes please'})
        .toPromise()
        .then(function () {
          sinonAssert.calledOnce(execSpy);
        });
    });

    it('is chainable', function () {
      const execSpy = sinonSpy();
      this.Dummy.prototype.askFor = function () {
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

      return this.ctx
        .withPrompts({yeoman: 'yes please'})
        .withPrompts({yo: 'yo man'})
        .toPromise()
        .then(function () {
          sinonAssert.calledOnce(execSpy);
        });
    });

    it('calls the callback', function () {
      const execSpy = sinonSpy();
      const promptSpy = sinonFake.returns('yes please');
      this.Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(function (answers) {
          execSpy();
          assert.equal(answers.yeoman, 'yes please');
        });
      };

      return this.ctx
        .withPrompts({yeoman: 'no please'}, promptSpy)
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
    it('creates mocked generator', function (done) {
      this.ctx.withMockedGenerators(['foo:bar']).on(
        'ready',
        function () {
          assert(this.ctx.env.get('foo:bar'));
          assert(this.ctx.mockedGenerators['foo:bar']);
          done();
        }.bind(this),
      );
    });
  });

  describe('#withGenerators()', function () {
    it('register paths', function (done) {
      this.ctx
        .withGenerators([require.resolve('./fixtures/generator-simple/app')])
        .on(
          'ready',
          function () {
            assert(this.ctx.env.get('simple:app'));
            done();
          }.bind(this),
        );
    });

    it('register mocked generator', function (done) {
      this.ctx
        .withGenerators([[helpers.createDummyGenerator(), 'dummy:gen']])
        .on(
          'ready',
          function () {
            assert(this.ctx.env.get('dummy:gen'));
            done();
          }.bind(this),
        );
    });

    it('allow multiple calls', function (done) {
      this.ctx
        .withGenerators([require.resolve('./fixtures/generator-simple/app')])
        .withGenerators([[helpers.createDummyGenerator(), 'dummy:gen']])
        .on(
          'ready',
          function () {
            assert(this.ctx.env.get('dummy:gen'));
            assert(this.ctx.env.get('simple:app'));
            done();
          }.bind(this),
        );
    });
  });

  describe('#withEnvironment()', function () {
    it('register paths', function (done) {
      this.ctx
        .withEnvironment((env) => {
          env.register(require.resolve('./fixtures/generator-simple/app'));
          return env;
        })
        .on(
          'ready',
          function () {
            assert(this.ctx.env.get('simple:app'));
            done();
          }.bind(this),
        );
    });
  });

  describe('#withLocalConfig()', function () {
    it('provides config to the generator', function (done) {
      this.ctx
        .withLocalConfig({
          some: true,
          data: 'here',
        })
        .on(
          'ready',
          function () {
            assert.equal(this.ctx.generator.config.get('some'), true);
            assert.equal(this.ctx.generator.config.get('data'), 'here');
            done();
          }.bind(this),
        );
    });
  });

  describe('#_createRunResultOptions()', function () {
    it('creates RunResult configuration', function (done) {
      this.ctx
        .withLocalConfig({
          some: true,
          data: 'here',
        })
        .on(
          'ready',
          function () {
            const options = this.ctx._createRunResultOptions();
            assert.equal(options.env, this.ctx.env);
            assert.equal(options.memFs, this.ctx.env.sharedFs);
            assert.equal(options.oldCwd, this.ctx.oldCwd);
            assert.equal(options.cwd, this.ctx.targetDirectory);
            assert.equal(options.envOptions, this.ctx.envOptions);
            assert.equal(options.mockedGenerators, this.ctx.mockedGenerators);
            assert.deepEqual(options.settings, this.ctx.settings);
            done();
          }.bind(this),
        );
    });
  });
});
