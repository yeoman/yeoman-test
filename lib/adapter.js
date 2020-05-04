/* eslint-disable max-params */
'use strict';
var events = require('events');
var _ = require('lodash');
var inquirer = require('inquirer');
var sinon = require('sinon');
var { PassThrough } = require('stream');

function DummyPrompt(mockedAnswers, callback, question, _rl, answers) {
  this.answers = { ...answers, ...mockedAnswers };
  this.question = question;
  this.callback = callback || (answers => answers);
}

DummyPrompt.prototype.run = function() {
  var answer = this.answers[this.question.name];
  var isSet;

  switch (this.question.type) {
    case 'list':
      // List prompt accepts any answer value including null
      isSet = answer !== undefined;
      break;
    case 'confirm':
      // Ensure that we don't replace `false` with default `true`
      isSet = answer || answer === false;
      break;
    default:
      // Other prompts treat all falsy values to default
      isSet = Boolean(answer);
  }

  if (!isSet) {
    answer = this.question.default;

    if (answer === undefined && this.question.type === 'confirm') {
      answer = true;
    }
  }

  return Promise.resolve(this.callback(answer));
};

function TestAdapter(answers) {
  answers = answers || {};
  this.promptModule = inquirer.createPromptModule({
    input: new PassThrough(),
    output: new PassThrough(),
    skipTTYChecks: true
  });

  Object.keys(this.promptModule.prompts).forEach(function(promptName) {
    this.promptModule.registerPrompt(
      promptName,
      DummyPrompt.bind(DummyPrompt, answers, undefined)
    );
  }, this);

  this.diff = sinon.spy();
  this.log = sinon.spy();
  _.extend(this.log, events.EventEmitter.prototype);

  // Make sure all log methods are defined
  [
    'write',
    'writeln',
    'ok',
    'error',
    'skip',
    'force',
    'create',
    'invoke',
    'conflict',
    'identical',
    'info',
    'table'
  ].forEach(function(methodName) {
    this.log[methodName] = sinon.stub().returns(this.log);
  }, this);
}

TestAdapter.prototype.prompt = function(questions, prefilledAnswers, cb) {
  if (typeof prefilledAnswers === 'function') {
    cb = prefilledAnswers;
    prefilledAnswers = undefined;
  }

  var promise = this.promptModule(questions, prefilledAnswers);
  promise.then(cb || _.noop);
  return promise;
};

module.exports = {
  DummyPrompt: DummyPrompt,
  TestAdapter: TestAdapter
};
