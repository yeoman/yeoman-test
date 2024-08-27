import assert from 'node:assert';
import { describe, expect, it } from 'vitest';
import { TestAdapter } from '../src/adapter.js';

describe('TestAdapter', () => {
  describe('#prompt()', () => {
    it('allows pre-filled answers', async () => {
      const adapter = new TestAdapter();
      return adapter
        .prompt([{ name: 'respuesta', message: 'foo', type: 'input', default: 'bar' }], {
          respuesta: 'foo',
        })
        .then(answers => {
          assert.equal(answers.respuesta, 'foo');
        });
    });
  });
  describe('#queue()', () => {
    it('should execute the callback', async () => {
      const adapter = new TestAdapter();
      await expect(adapter.queue(() => 2)).resolves.toBe(2);
    });
  });
  describe('#progress()', () => {
    it('should execute the callback', async () => {
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
