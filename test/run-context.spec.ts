import fs, { realpathSync } from 'node:fs';
import path, { dirname } from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { mock } from 'node:test';
import { promisify as promisify_ } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Generator from 'yeoman-generator';
import { RunContextBase as RunContext } from '../src/run-context.js';
import helpers from '../src/import.js';
import { BaseEnvironmentOptions } from '@yeoman/types';

const tempDirectory = realpathSync(os.tmpdir());

/* Remove argument from promisify return */
const promisify = function_ => () => promisify_(function_)();
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const tmpdir = path.join(tempDirectory, 'yeoman-run-context');

describe('RunContext', () => {
  let environmentOptions: BaseEnvironmentOptions | undefined;
  let context: RunContext;
  let execSpy;
  let Dummy;

  beforeEach(() => {
    process.chdir(__dirname);

    execSpy = mock.fn();
    Dummy = class extends Generator {
      exec(...arguments_) {
        execSpy.apply(this, arguments_);
      }
    };

    context = new RunContext(Dummy, undefined, environmentOptions);
  });

  afterEach(
    promisify(done => {
      process.chdir(__dirname);

      if (context.settings.tmpdir) {
        context.cleanTestDirectory();
      }

      if (context.completed || context.errored || !context.ran) {
        done();
        return;
      }

      try {
        context.on('end', done);
      } catch {
        // Ignore error
      }
    }),
  );

  describe('constructor', () => {
    beforeAll(() => {
      environmentOptions = { foo: 'bar' };
    });
    it(
      'forwards envOptions to the environment',
      promisify(done => {
        context.on('ready', function () {
          assert.equal(this.env.options.foo, environmentOptions.foo);
          done();
        });
      }),
    );

    it(
      'accept path parameter',
      promisify(done => {
        const context = new RunContext(require.resolve('./fixtures/generator-simple/app'));

        context
          .on('ready', async () => {
            assert(await context.env.get('simple:app'));
          })
          .on('end', done);
      }),
    );

    it(
      'propagate generator error events',
      promisify(done => {
        const error = new Error('an error');
        const Dummy = helpers.createDummyGenerator();
        const execSpy = mock.fn(
          () => {},
          () => {
            throw error;
          },
        );
        const endSpy = mock.fn();
        Dummy.prototype.test = execSpy;
        Dummy.prototype.end = execSpy;
        const context = new RunContext(Dummy);

        context.on('error', error_ => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
          assert.equal(error_, error);
          assert.strictEqual(endSpy.mock.callCount(), 0);
          done();
        });
      }),
    );

    it(
      'accept generator constructor parameter (and assign gen:test as namespace)',
      promisify(done => {
        context.on('ready', async () => {
          assert(await context.env.get('gen:test'));
          done();
        });
      }),
    );

    it('set namespace and resolved path in generator', async () => {
      const context = new RunContext(Dummy, {
        resolved: 'path',
        namespace: 'simple:app',
      });

      await context.build();

      expect(((await context.env.get('simple:app')) as any).resolved).toMatch(/^path/);
    });

    it(
      'run the generator asynchronously',
      promisify(done => {
        assert.equal(execSpy.mock.callCount(), 0);
        context.on('end', () => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
          done();
        });
      }),
    );

    it(
      'automatically run in a random tmpdir',
      promisify(done => {
        context.on('end', () => {
          assert.notEqual(process.cwd(), __dirname);
          assert.equal(tempDirectory, path.dirname(process.cwd()));
          done();
        });
      }),
    );

    it(
      'allows an option to not automatically run in tmpdir',
      promisify(done => {
        const cwd = process.cwd();
        const context = new RunContext(Dummy, { cwd, tmpdir: false });
        context.on('end', () => {
          assert.equal(cwd, process.cwd());
          done();
        });
      }),
    );

    it('throws an error when calling cleanTestDirectory with not tmpdir settings', () => {
      const cwd = process.cwd();
      const context = new RunContext(Dummy, { cwd, tmpdir: false });
      try {
        context.cleanTestDirectory();
        assert.fail();
      } catch (error) {
        assert(error.message.includes('Cleanup test dir called with false tmpdir option.'));
      }
    });

    it('accepts settings', () => {
      const Dummy = helpers.createDummyGenerator();
      const context = new RunContext(Dummy, {
        tmpdir: false,
        resolved: 'path',
        namespace: 'simple:app',
      });
      assert.equal(context.settings.tmpdir, false);
      assert.equal(context.settings.resolved, 'path');
      assert.equal(context.settings.namespace, 'simple:app');
    });

    it(
      'only run a generator once',
      promisify(done => {
        context.on('end', () => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
          done();
        });

        context.setupEventListeners();
        context.setupEventListeners();
      }),
    );

    it(
      'set --force by default',
      promisify(done => {
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options.force, true);
          done();
        });
      }),
    );

    it(
      'set --skip-install by default',
      promisify(done => {
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options.skipInstall, true);
          done();
        });
      }),
    );

    it(
      'set --skip-cache by default',
      promisify(done => {
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options.skipCache, true);
          done();
        });
      }),
    );
  });

  describe('error handling', () => {
    afterEach(() => {
      process.removeAllListeners('unhandledRejection');
    });

    it(
      'throw an unhandledRejection when no listener is present',
      promisify(done => {
        const error = new Error('dummy exception');
        const execSpy = mock.fn(
          () => {},
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

        setImmediate(() => {
          return new RunContext(Dummy).on('end', () => {});
        });
      }),
    );
  });

  describe('#toPromise()', () => {
    it('return a resolved promise with the target directory on success', async () => {
      const runResult = await context.toPromise();
      assert.equal(context.targetDirectory, runResult.cwd);
    });

    it('returns a reject promise on error', async () => {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => {},
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const context = new RunContext(Dummy);

      return context.toPromise().catch(error_ => {
        assert.equal(error_, error);
      });
    });
  });

  describe('#then()', () => {
    it('handle success', async () => {
      return context.toPromise().then(runResult => {
        assert.equal(context.targetDirectory, runResult.cwd);
      });
    });

    it('handles errors', async () => {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => {},
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const context = new RunContext(Dummy);

      return context.toPromise().then(
        () => {},
        error_ => {
          assert.equal(error_, error);
        },
      );
    });
  });

  describe('#catch()', () => {
    it('handles errors', async () => {
      const error = new Error('an error');
      const Dummy = helpers.createDummyGenerator();
      const execSpy = mock.fn(
        () => {},
        () => {
          throw error;
        },
      );
      Dummy.prototype.test = execSpy;
      const context = new RunContext(Dummy);

      return context.toPromise().catch(error_ => {
        assert.equal(error_, error);
      });
    });
  });

  describe('#inDir()', () => {
    let temporaryDirectory;

    beforeEach(() => {
      process.chdir(__dirname);
      temporaryDirectory = tmpdir;
    });

    it('call helpers.testDirectory()', () => {
      const spy = mock.method(helpers, 'testDirectory');
      context.inDir(temporaryDirectory);
      assert.equal(spy.mock.calls[0].arguments[0], temporaryDirectory);
      spy.mock.restore();
    });

    it('is chainable', () => {
      assert.equal(context.inDir(temporaryDirectory), context);
    });

    it(
      'accepts optional `cb` to be invoked with resolved `dir`',
      promisify(done => {
        const context = new RunContext(Dummy);
        const callback = mock.fn(() => {
          assert.strictEqual(callback.mock.callCount(), 1);
          assert.equal(callback.mock.calls[0].this, context);
          assert.equal(callback.mock.calls[0].arguments[0], path.resolve(temporaryDirectory));
        });

        context.inDir(temporaryDirectory, callback).on('end', done);
      }),
    );

    it('throws error at additional calls with dirPath', () => {
      assert(context.inDir(temporaryDirectory));
      try {
        context.inDir(temporaryDirectory);
        assert.fail();
      } catch (error) {
        assert(error.message.includes('Test directory has already been set.'));
      }
    });
  });

  describe('#doInDir()', () => {
    let temporaryDirectory;

    beforeEach(() => {
      process.chdir(__dirname);
      temporaryDirectory = tmpdir;
    });

    it(
      'accepts `cb` to be invoked with resolved `dir`',
      promisify(done => {
        let callbackCalled = false;
        context
          .inDir(temporaryDirectory)
          .doInDir(dirPath => {
            callbackCalled = true;
            assert.equal(dirPath, temporaryDirectory);
          })
          .on('end', () => {
            if (callbackCalled) {
              done();
            }
          });
      }),
    );

    it(
      'accepts multiples call with `cb` to be invoked with resolved `dir`',
      promisify(done => {
        let callbackCalled1 = false;
        let callbackCalled2 = false;
        context
          .inDir(temporaryDirectory)
          .doInDir(dirPath => {
            callbackCalled1 = true;
            assert.equal(dirPath, temporaryDirectory);
          })
          .doInDir(dirPath => {
            callbackCalled2 = true;
            assert.equal(dirPath, temporaryDirectory);
          })
          .on('end', () => {
            if (callbackCalled1 && callbackCalled2) {
              done();
            }
          });
      }),
    );
  });

  describe('#cd()', () => {
    let temporaryDirectory;

    beforeEach(() => {
      process.chdir(__dirname);
      temporaryDirectory = tmpdir;
      fs.mkdirSync(tmpdir, { recursive: true });
    });

    it('do not call helpers.testDirectory()', () => {
      const spy = mock.method(helpers, 'testDirectory');
      context.cd(temporaryDirectory);
      assert.strictEqual(spy.mock.callCount(), 0);
      spy.mock.restore();
    });

    it('is chainable', () => {
      assert.equal(context.cd(temporaryDirectory), context);
    });

    it('should set inDirSet & targetDirectory', () => {
      assert(!context.targetDirectory);
      context.cd(temporaryDirectory);
      assert.equal(context.targetDirectory, temporaryDirectory);
    });

    it('should cd into created directory', () => {
      const spy = mock.method(process, 'chdir');
      context.cd(temporaryDirectory);
      assert.equal(spy.mock.calls[0].arguments[0], temporaryDirectory);
      spy.mock.restore();
    });

    it('should throw error if directory do not exist', () => {
      try {
        context.cd(path.join(temporaryDirectory, 'NOT_EXIST'));
        assert.fail();
      } catch (error) {
        assert(error.message.includes(temporaryDirectory));
      }
    });
  });

  describe('#inTmpDir', () => {
    it('call helpers.testDirectory()', () => {
      const spy = mock.method(helpers, 'testDirectory');
      context.inTmpDir();
      assert.strictEqual(spy.mock.callCount(), 1);
      spy.mock.restore();
    });

    it('is chainable', () => {
      assert.equal(context.inTmpDir(), context);
    });

    it(
      'accepts optional `cb` to be invoked with resolved `dir`',
      promisify(done => {
        const callback = mock.fn(function (dir) {
          assert.equal(this, context);
          assert(dir.includes(tempDirectory));
        });

        context.inTmpDir(callback).on('end', done);
      }),
    );
  });

  describe('#withArguments()', () => {
    it(
      'provide arguments to the generator when passed as Array',
      promisify(done => {
        context.withArguments(['one', 'two']);
        context.on('end', () => {
          assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['one', 'two']);
          done();
        });
      }),
    );

    it(
      'provide arguments to the generator when passed as String',
      promisify(done => {
        context.withArguments('foo bar');
        context.on('end', () => {
          assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['foo', 'bar']);
          done();
        });
      }),
    );

    it('throws when arguments passed is neither a String or an Array', () => {
      assert.throws(context.withArguments.bind(context, { foo: 'bar' }));
    });

    it(
      'is chainable',
      promisify(done => {
        context.withArguments('foo').withArguments('bar');
        context.on('end', () => {
          assert.deepEqual(execSpy.mock.calls[0].this.arguments, ['foo', 'bar']);
          done();
        });
      }),
    );
  });

  describe('#withOptions()', () => {
    it(
      'provide options to the generator',
      promisify(done => {
        context.withOptions({ foo: 'bar' });
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options.foo, 'bar');
          done();
        });
      }),
    );

    it(
      'allow default settings to be overriden',
      promisify(done => {
        context.withOptions({
          'skip-install': false,
          force: false,
        });
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options.skipInstall, false);
          assert.equal(execSpy.mock.calls[0].this.options.force, false);
          done();
        });
      }),
    );

    it(
      'camel case options',
      promisify(done => {
        context.withOptions({ 'foo-bar': false });
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options['foo-bar'], false);
          assert.equal(execSpy.mock.calls[0].this.options.fooBar, false);
          done();
        });
      }),
    );

    it(
      'kebab case options',
      promisify(done => {
        context.withOptions({ barFoo: false });
        context.on('end', () => {
          assert.equal(execSpy.mock.calls[0].this.options['bar-foo'], false);
          assert.equal(execSpy.mock.calls[0].this.options.barFoo, false);
          done();
        });
      }),
    );

    it(
      'is chainable',
      promisify(done => {
        context.withOptions({ foo: 'bar' }).withOptions({ john: 'doe' });
        context.on('end', () => {
          const { options } = execSpy.mock.calls[0].this;
          assert.equal(options.foo, 'bar');
          assert.equal(options.john, 'doe');
          done();
        });
      }),
    );
  });

  describe('#withAnswers()', () => {
    it('is call automatically', async () => {
      const askFor = mock.fn();
      const prompt = mock.fn();
      Dummy.prototype.askFor = function () {
        askFor();
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
          default: 'pass',
        }).then(answers => {
          assert.equal(answers.yeoman, 'pass');
          prompt();
        });
      };

      return context.toPromise().then(() => {
        assert.strictEqual(askFor.mock.callCount(), 1);
        assert.strictEqual(prompt.mock.callCount(), 1);
      });
    });

    it('mock the prompt', async () => {
      const execSpy = mock.fn();
      Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(answers => {
          assert.equal(answers.yeoman, 'yes please');
          execSpy();
        });
      };

      return context
        .withAnswers({ yeoman: 'yes please' })
        .toPromise()
        .then(() => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
        });
    });

    it('is chainable', async () => {
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
        ]).then(answers => {
          execSpy();
          assert.equal(answers.yeoman, 'yes please');
          assert.equal(answers.yo, 'yo man');
        });
      };

      return context
        .withAnswers({ yeoman: 'yes please' })
        .withAnswers({ yo: 'yo man' })
        .toPromise()
        .then(() => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
        });
    });

    it('calls the callback', async () => {
      const execSpy = mock.fn();
      const promptSpy = mock.fn(
        () => {},
        () => 'yes please',
      );
      Dummy.prototype.askFor = function () {
        return this.prompt({
          name: 'yeoman',
          type: 'input',
          message: 'Hey!',
        }).then(answers => {
          execSpy();
          assert.equal(answers.yeoman, 'yes please');
        });
      };

      return context
        .withAnswers({ yeoman: 'no please' }, { callback: promptSpy })
        .toPromise()
        .then(() => {
          assert.strictEqual(execSpy.mock.callCount(), 1);
          assert.strictEqual(promptSpy.mock.callCount(), 1);
          assert.equal(promptSpy.mock.calls[0].arguments[0], 'no please');
        });
    });

    it('sets askedQuestions', async () => {
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

      const result = await context.withAnswers({ yeoman: 'no please' }).toPromise();

      assert.deepEqual(result.askedQuestions, [
        { name: 'yeoman', answer: 'no please' },
        { name: 'yeoman2', answer: undefined },
      ]);
    });
  });

  describe('#withMockedGenerators()', () => {
    it('creates mocked generator', async () => {
      await context.withMockedGenerators(['foo:bar']).build();
      assert(await context.env.get('foo:bar'));
      assert(context.mockedGenerators['foo:bar']);
    });
  });

  describe('#withGenerators()', () => {
    it(
      'register paths',
      promisify(done => {
        context.withGenerators([require.resolve('./fixtures/generator-simple/app')]).on('ready', async () => {
          assert(await context.env.get('simple:app'));
          done();
        });
      }),
    );

    it('register paths with namespaces', async () => {
      await context.withGenerators([[require.resolve('./fixtures/generator-simple/app'), { namespace: 'foo:bar' }]]).build();
      assert(await context.env.get('foo:bar'));
    });

    it(
      'register mocked generator',
      promisify(done => {
        context.withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]]).on('ready', async () => {
          assert(await context.env.get('dummy:gen'));
          done();
        });
      }),
    );

    it(
      'allow multiple calls',
      promisify(done => {
        context
          .withGenerators([require.resolve('./fixtures/generator-simple/app')])
          .withGenerators([[helpers.createDummyGenerator(), { namespace: 'dummy:gen' }]])
          .on('ready', async () => {
            assert(await context.env.get('dummy:gen'));
            assert(await context.env.get('simple:app'));
            done();
          });
      }),
    );
  });

  describe('#withSpawnMock()', () => {
    it('provide arguments to the generator when passed as String', async () => {
      context.withSpawnMock();
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

      const result = await context.toPromise();
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[0], ['spawnCommand', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[1], ['spawnCommandSync', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[2], ['spawn', 'foo']);
      assert.deepStrictEqual(result.getSpawnArgsUsingDefaultImplementation()[3], ['spawnSync', 'foo']);
    });

    it('with callback', async () => {
      context.withSpawnMock<ReturnType<typeof mock.fn>>({
        stub: mock.fn(),
        registerNodeMockDefaults: true,
        callback({ stub, implementation }) {
          const newImplementation = (...arguments_) => {
            const [first, second] = arguments_;
            if (first === 'spawnCommandSync' && second === 'foo') {
              return 'bar';
            }
            return implementation(...arguments_);
          };
          stub.mock.mockImplementation(newImplementation);
        },
      });

      Dummy.prototype.mockTask = async function () {
        expect(this.spawnCommandSync()).toMatchObject({ exitCode: 0, stderr: '', stdout: '' });
        expect(this.spawnCommandSync('foo')).toBe('bar');
      };

      await context.toPromise();
    });

    it('without defaults', async () => {
      context.withSpawnMock({
        stub: mock.fn(),
        registerNodeMockDefaults: false,
      });

      Dummy.prototype.mockTask = async function () {
        expect(this.spawnCommandSync()).toBeUndefined();
      };

      await context.toPromise();
    });
  });

  describe('#withEnvironment()', () => {
    it(
      'register paths',
      promisify(done => {
        context
          .withEnvironment(environment => {
            environment.register(require.resolve('./fixtures/generator-simple/app'));
            return environment;
          })
          .on('ready', async () => {
            assert(await context.env.get('simple:app'));
            done();
          });
      }),
    );
  });

  describe('#withEnvironmentRun()', () => {
    it('calls runGenerator by default', async () => {
      let mockedRunGenerator: ReturnType<typeof mock.fn>;
      await context
        .withEnvironment(environment => {
          mockedRunGenerator = mock.method(environment, 'runGenerator');
        })
        .toPromise();
      expect(mockedRunGenerator!.mock.callCount()).toBe(1);
    });

    it('calls custom environment run method', async () => {
      let mockedRunGenerator: ReturnType<typeof mock.fn>;
      const mockedEnvironmentRun = mock.fn();
      await context
        .withEnvironment(environment => {
          mockedRunGenerator = mock.method(environment, 'runGenerator');
        })
        .withEnvironmentRun(mockedEnvironmentRun)
        .toPromise();

      expect(mockedRunGenerator!.mock.callCount()).toBe(0);
      expect(mockedEnvironmentRun!.mock.callCount()).toBe(1);
    });
  });

  describe('#withLocalConfig()', () => {
    it(
      'provides config to the generator',
      promisify(done => {
        context
          .withLocalConfig({
            some: true,
            data: 'here',
          })
          .on('ready', () => {
            assert.equal(context.generator.config.get('some'), true);
            assert.equal(context.generator.config.get('data'), 'here');
            done();
          });
      }),
    );
  });

  describe('#_createRunResultOptions()', () => {
    it(
      'creates RunResult configuration',
      promisify(done => {
        context
          .withLocalConfig({
            some: true,
            data: 'here',
          })
          .on('ready', () => {
            const options = context._createRunResultOptions();
            assert.equal(options.env, context.env);
            assert.equal(options.memFs, context.env.sharedFs);
            assert.equal(options.oldCwd, context.oldCwd);
            assert.equal(options.cwd, context.targetDirectory);
            assert.equal(options.envOptions, context.envOptions);
            assert.equal(options.mockedGenerators, context.mockedGenerators);
            assert.deepEqual(options.settings, context.settings);
            done();
          });
      }),
    );
  });
});
