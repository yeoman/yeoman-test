import assert from 'node:assert';
import {TestAdapter} from '../src/adapter.js';

describe('TestAdapter', function () {
  describe('#prompt()', function () {
    it('allows pre-filled answers', async function () {
      const adapter = new TestAdapter();
      return adapter
        .prompt(
          [{name: 'respuesta', message: 'foo', type: 'input', default: 'bar'}],
          {
            respuesta: 'foo',
          },
        )
        .then(function (answers) {
          assert.equal(answers.respuesta, 'foo');
        });
    });
  });
});
