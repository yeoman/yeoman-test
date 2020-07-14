/* eslint-disable max-nested-callbacks */
'use strict';
const assert = require('assert');
const path = require('path');

const helpers = require('../lib');
const RunContext = require('../lib/run-context');
const RunResult = require('../lib/run-result');
const SimpleApp = require('./fixtures/generator-simple/app');

describe('RunContext running environment', function() {
  const defaultEnvOptions = {foo: 'bar'};
  const defaultRunContextOptions = {};

  let gen;
  const ctxOptions = {};
  let ctx;
  const envOptions = {};
  let build = true;
  let lookups = [];

  beforeEach(function() {
    process.chdir(__dirname);

    if (!gen) {
      throw new Error('Generator is required');
    }

    ctx = helpers
      .create(
        gen,
        {...defaultRunContextOptions, ...ctxOptions},
        {...defaultEnvOptions, envOptions}
      )
      .withLookups(lookups);
    if (build) {
      ctx.build();
    }
  });

  afterEach(function() {
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

    it('passes runEnvironment to RunContext', () => {
      assert.equal(ctx.settings.runEnvironment, true);
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

    it('passes newErrorHandler to the environment', () => {
      return ctx.run().then(() => {
        assert(ctx.env.options.newErrorHandler);
      });
    });

    it('passes forwardErrorToEnvironment to the generator', () => {
      return ctx.run().then(() => {
        assert(ctx.generator.options.forwardErrorToEnvironment);
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

  describe('with path', () => {
    before(() => {
      gen = require.resolve('./fixtures/generator-simple/app');
    });
    after(() => {
      gen = undefined;
    });

    it('registers the generator on the environment', () => {
      return ctx.run().then(() => {
        assert(ctx.env.get('simple:app') === SimpleApp);
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
      lookups = {packagePaths: path.resolve('./fixtures/generator-simple')};
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
      lookups = [{npmPaths: path.resolve('./fixtures/')}];
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
          error => assert(/throwing error/.test(error.message))
        );
      });
    });

    describe('with composing generator', () => {
      before(() => {
        gen = 'simple:composing';
        build = false;
      });
      after(() => {
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
            error => assert(/throwing error/.test(error.message))
          );
      });
    });
  });
});
