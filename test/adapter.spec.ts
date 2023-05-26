import assert from 'node:assert';
import { expect } from 'esmocha';
import { TestAdapter } from '../src/adapter.js';

describe('TestAdapter', function () {
  describe('#prompt()', function () {
    it('allows pre-filled answers', async function () {
      const adapter = new TestAdapter();
      return adapter
        .prompt([{ name: 'respuesta', message: 'foo', type: 'input', default: 'bar' }], {
          respuesta: 'foo',
        })
        .then(function (answers) {
          assert.equal(answers.respuesta, 'foo');
        });
    });
  });
  describe('#queue()', function () {
    it('should execute the callback', async function () {
      const adapter = new TestAdapter();
      await expect(adapter.queue(() => 2)).resolves.toBe(2);
    });
  });
  describe('#progress()', function () {
    it('should execute the callback', async function () {
      const adapter = new TestAdapter();
      await expect(
        adapter.progress(({ step }) => {
          step('prefix', 'msg');
          return 2;
        }),
      ).resolves.toBe(2);
    });
  });
});
