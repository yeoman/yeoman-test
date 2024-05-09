/* eslint-disable max-nested-callbacks */
import assert from 'node:assert';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fake as sinonFake, replace as sinonReplace } from 'sinon';
import { type LookupOptions } from '@yeoman/types';
import helpers from '../src/helpers.js';
import RunContext from '../src/run-context.js';
import RunResult from '../src/run-result.js';
import SimpleApp from './fixtures/generator-simple/app/index.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RunContext running environment', function () {
  const defaultEnvOptions = { foo: 'bar' };
  const defaultRunContextOptions = {};

  let gen;
  const ctxOptions = {};
  let ctx;
  const envOptions = {};
  let build = true;
  let lookups: LookupOptions[] = [];

  beforeEach(async function () {
    process.chdir(__dirname);

    if (!gen) {
      throw new Error('Generator is required');
    }

    ctx = helpers.create(gen, { ...defaultRunContextOptions, ...ctxOptions }, { ...defaultEnvOptions, envOptions }).withLookups(lookups);
    if (build) {
      await ctx.build();
    }
  });

  afterEach(function () {
    process.chdir(__dirname);
    ctx.cleanTestDirectory();
  });

  describe('with string', () => {
    before(() => {
      gen = require.resolve('./fixtures/generator-simple/app');
    });
    after(() => {
      gen = undefined;
    });

    it('returns instanceof RunContext', () => {
      assert(ctx instanceof RunContext);
    });

    it('promises a RunResult', () => {
      return ctx.run().then(runResult => {
        assert(runResult instanceof RunResult);
      });
    });

    it('forwards envOptions to the environment', () => {
      return ctx.run().then(() => {
        assert.equal(ctx.env.options.foo, defaultEnvOptions.foo);
      });
    });

    it('forwards the mem-fs to the environment', () => {
      return ctx.run().then(() => {
        assert.equal(ctx.memFs, ctx.env.sharedFs);
      });
    });

    it('passes newErrorHandler to the environment', () => {
      return ctx.run().then(() => {
        assert(ctx.env.options.newErrorHandler);
      });
    });
  });

  describe('with generator', () => {
    before(() => {
      gen = SimpleApp;
    });
    after(() => {
      gen = undefined;
    });

    it('runs the generator', () => {
      return ctx.run().then(() => {
        assert(ctx.env.generatorTestExecuted);
      });
    });
  });

  describe('with promised generator', () => {
    before(() => {
      gen = 'promised-generator';
      build = false;
    });
    beforeEach(() => {
      ctx.withEnvironment(env => {
        const FakeGenerator = helpers.createDummyGenerator();
        const fake = sinonFake.returns(Promise.resolve(new FakeGenerator([], { env })));
        sinonReplace(env, 'create', fake);
      });
    });
    after(() => {
      gen = undefined;
      build = true;
    });

    it('runs the generator', () => {
      return ctx.run().then(() => {
        assert(ctx.generator.shouldRun);
      });
    });
  });

  describe('with path', () => {
    before(() => {
      gen = require.resolve('./fixtures/generator-simple/app');
    });
    after(() => {
      gen = undefined;
    });

    it('registers the generator on the environment', () => {
      return ctx.run().then(async () => {
        assert((await ctx.env.get('simple:app')) === SimpleApp);
      });
    });

    it('runs the generator', () => {
      return ctx.run().then(() => {
        assert(ctx.env.generatorTestExecuted);
      });
    });
  });

  describe('with lookups with packagePaths', () => {
    before(() => {
      lookups = [{ packagePaths: [path.resolve('./fixtures/generator-simple')] }];
      gen = 'simple:app';
    });
    after(() => {
      lookups = [];
      gen = undefined;
    });

    it('registers every generator', () => {
      assert(ctx.env.get('simple:app'));
      assert(ctx.env.get('simple:composing'));
      assert(ctx.env.get('simple:throwing'));
    });

    it('runs the generator', () => {
      return ctx.run().then(() => {
        assert(ctx.env.generatorTestExecuted);
      });
    });
  });

  describe('with lookups with npmPaths', () => {
    before(() => {
      lookups = [{ npmPaths: [path.resolve('./fixtures/')] }];
    });
    after(() => {
      lookups = [];
    });

    describe('and simple generator', () => {
      before(() => {
        gen = 'simple:app';
      });
      after(() => {
        gen = undefined;
      });

      it('registers every generator', () => {
        assert(ctx.env.get('simple:app'));
        assert(ctx.env.get('simple:composing'));
        assert(ctx.env.get('simple:throwing'));
      });

      it('runs the generator', () => {
        return ctx.run().then(() => {
          assert(ctx.env.generatorTestExecuted);
        });
      });
    });

    describe('and generator that throws', () => {
      before(() => {
        gen = 'simple:throwing';
      });
      after(() => {
        gen = undefined;
      });

      it('rejects with the error', () => {
        return ctx.run().then(
          () => assert.fail(),
          error => {
            assert(/throwing error/.test(error.message));
          },
        );
      });
    });

    describe('with composing generator', () => {
      before(() => {
        lookups = [{ packagePaths: [path.resolve('./fixtures/generator-simple')] }];
        gen = 'simple:composing';
        build = false;
      });
      after(() => {
        lookups = [];
        gen = undefined;
        build = true;
      });

      it('runs the composed generator', () => {
        return ctx
          .withArguments('simple:app')
          .run()
          .then(() => {
            assert(ctx.env.generatorTestExecuted);
          });
      });

      it('rejects with the error', () => {
        return ctx
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
