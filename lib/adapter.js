/* eslint-disable max-params */
'use strict';
const events = require('events');
const _ = require('lodash');
const inquirer = require('inquirer');
const sinon = require('sinon');
const {PassThrough} = require('stream');

function DummyPrompt(mockedAnswers, options, question, _rl, answers) {
  this.answers = {...answers, ...mockedAnswers};
  this.question = question;

  if (typeof options === 'function') {
    this.callback = options;
  } else if (options) {
    this.callback = options.callback;
    this.throwOnMissingAnswer = options.throwOnMissingAnswer;
  }

  this.callback = this.callback || ((answers) => answers);
}

DummyPrompt.prototype.run = function () {
  let answer = this.answers[this.question.name];
  let isSet;

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

    if (answer === undefined) {
      const missingAnswerMessage = `Answer for ${this.question.name} was not provided`;
      console.warn(missingAnswerMessage);
      if (this.throwOnMissingAnswer) {
        return Promise.reject(new Error(missingAnswerMessage));
      }
    }

    if (answer === undefined && this.question.type === 'confirm') {
      answer = true;
    }
  }

  return Promise.resolve(this.callback(answer));
};

function TestAdapter(mockedAnswers) {
  this.promptModule = inquirer.createPromptModule({
    input: new PassThrough(),
    output: new PassThrough(),
    skipTTYChecks: true
  });

  Object.keys(this.promptModule.prompts).forEach(function (promptName) {
    this.promptModule.registerPrompt(
      promptName,
      class CustomDummyPrompt extends DummyPrompt {
        constructor(question, rl, answers) {
          super(mockedAnswers, undefined, question, rl, answers);
        }
      }
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
  ].forEach(function (methodName) {
    this.log[methodName] = sinon.stub().returns(this.log);
  }, this);
}

TestAdapter.prototype.prompt = function (questions, prefilledAnswers, cb) {
  if (typeof prefilledAnswers === 'function') {
    cb = prefilledAnswers;
    prefilledAnswers = undefined;
  }

  const promise = this.promptModule(questions, prefilledAnswers);
  promise.then(cb || _.noop);
  return promise;
};

module.exports = {
  DummyPrompt,
  TestAdapter
};
