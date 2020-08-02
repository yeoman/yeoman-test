'use strict';
const assert = require('assert');
const {TestAdapter} = require('../lib/adapter');

describe('TestAdapter', function () {
  describe('#prompt()', function () {
    it('allows pre-filled answers', function () {
      const adapter = new TestAdapter();
      return adapter
        .prompt(
          [{name: 'respuesta', message: 'foo', type: 'input', default: 'bar'}],
          {
            respuesta: 'foo'
          }
        )
        .then(function (answers) {
          assert.equal(answers.respuesta, 'foo');
        });
    });
  });
});
