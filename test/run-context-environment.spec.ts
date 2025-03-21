import assert from 'node:assert';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
import { type LookupOptions } from '@yeoman/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import helpers from '../src/import.js';
import RunContext from '../src/run-context.js';
import RunResult from '../src/run-result.js';
import SimpleApp from './fixtures/generator-simple/app/index.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RunContext running environment', () => {
  const defaultEnvironmentOptions = { foo: 'bar' };
  const defaultRunContextOptions = {};

  let gen;
  const contextOptions = {};
  let context;
  const environmentOptions = {};
  let build = true;
  let lookups: LookupOptions[] = [];

  beforeEach(async () => {
    process.chdir(__dirname);

    if (!gen) {
      throw new Error('Generator is required');
    }

    context = helpers
      .create(gen, { ...defaultRunContextOptions, ...contextOptions }, { ...defaultEnvironmentOptions, envOptions: environmentOptions })
      .withLookups(lookups);
    if (build) {
      await context.build();
    }
  });

  afterEach(() => {
    process.chdir(__dirname);
    context.cleanTestDirectory();
  });

  describe('with string', () => {
    beforeAll(() => {
      gen = require.resolve('./fixtures/generator-simple/app');
    });
    afterAll(() => {
      gen = undefined;
    });

    it('returns instanceof RunContext', () => {
      assert(context instanceof RunContext);
    });

    it('promises a RunResult', () => {
      return context.run().then(runResult => {
        assert(runResult instanceof RunResult);
      });
    });

    it('forwards envOptions to the environment', () => {
      return context.run().then(() => {
        assert.equal(context.env.options.foo, defaultEnvironmentOptions.foo);
      });
    });

    it('forwards the mem-fs to the environment', () => {
      return context.run().then(() => {
        assert.equal(context.memFs, context.env.sharedFs);
      });
    });

    it('passes newErrorHandler to the environment', () => {
      return context.run().then(() => {
        assert(context.env.options.newErrorHandler);
      });
    });
  });

  describe('with generator', () => {
    beforeAll(() => {
      gen = SimpleApp;
    });
    afterAll(() => {
      gen = undefined;
    });

    it('runs the generator', () => {
      return context.run().then(() => {
        assert(context.env.generatorTestExecuted);
      });
    });
  });

  describe('with promised generator', () => {
    beforeAll(() => {
      gen = 'promised-generator';
      build = false;
    });
    beforeEach(() => {
      context.withEnvironment(environment => {
        const FakeGenerator = helpers.createDummyGenerator();
        mock.method(environment, 'create', () => Promise.resolve(new FakeGenerator([], { env: environment })));
      });
    });
    afterAll(() => {
      gen = undefined;
      build = true;
    });

    it('runs the generator', () => {
      return context.run().then(() => {
        assert(context.generator.shouldRun);
      });
    });
  });

  describe('with path', () => {
    beforeAll(() => {
      gen = require.resolve('./fixtures/generator-simple/app');
    });
    afterAll(() => {
      gen = undefined;
    });

    it.skip('registers the generator on the environment', () => {
      return context.run().then(async () => {
        assert.equal(await context.env.get('simple:app'), SimpleApp);
      });
    });

    it('runs the generator', () => {
      return context.run().then(() => {
        assert(context.env.generatorTestExecuted);
      });
    });
  });

  describe('with lookups with packagePaths', () => {
    beforeAll(() => {
      lookups = [{ packagePaths: [path.resolve('./fixtures/generator-simple')] }];
      gen = 'simple:app';
    });
    afterAll(() => {
      lookups = [];
      gen = undefined;
    });

    it('registers every generator', () => {
      assert(context.env.get('simple:app'));
      assert(context.env.get('simple:composing'));
      assert(context.env.get('simple:throwing'));
    });

    it('runs the generator', () => {
      return context.run().then(() => {
        assert(context.env.generatorTestExecuted);
      });
    });
  });

  describe('with lookups with npmPaths', () => {
    beforeAll(() => {
      lookups = [{ npmPaths: [path.resolve('./fixtures/')] }];
    });
    afterAll(() => {
      lookups = [];
    });

    describe('and simple generator', () => {
      beforeAll(() => {
        gen = 'simple:app';
      });
      afterAll(() => {
        gen = undefined;
      });

      it('registers every generator', () => {
        assert(context.env.get('simple:app'));
        assert(context.env.get('simple:composing'));
        assert(context.env.get('simple:throwing'));
      });

      it('runs the generator', () => {
        return context.run().then(() => {
          assert(context.env.generatorTestExecuted);
        });
      });
    });

    describe('and generator that throws', () => {
      beforeAll(() => {
        gen = 'simple:throwing';
      });
      afterAll(() => {
        gen = undefined;
      });

      it('rejects with the error', () => {
        return context.run().then(
          () => assert.fail(),
          error => {
            assert(/throwing error/.test(error.message));
          },
        );
      });
    });

    describe('with composing generator', () => {
      beforeAll(() => {
        lookups = [{ packagePaths: [path.resolve('./fixtures/generator-simple')] }];
        gen = 'simple:composing';
        build = false;
      });
      afterAll(() => {
        lookups = [];
        gen = undefined;
        build = true;
      });

      it('runs the composed generator', () => {
        return context
          .withArguments('simple:app')
          .run()
          .then(() => {
            assert(context.env.generatorTestExecuted);
          });
      });

      it('rejects with the error', () => {
        return context
          .withArguments('simple:throwing')
          .run()
          .then(
            () => assert.fail(),
            error => {
              assert(/throwing error/.test(error.message));
            },
          );
      });
    });
  });
});
