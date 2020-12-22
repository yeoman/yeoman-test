/* eslint-disable max-params */
'use strict';
const events = require('events');
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
    if (answer === undefined && this.question.default === undefined) {
      const missingAnswerMessage = `yeoman-test: question ${this.question.name} was asked but answer was not provided`;
      console.warn(missingAnswerMessage);
      if (this.throwOnMissingAnswer) {
        return Promise.reject(new Error(missingAnswerMessage));
      }
    }

    answer = this.question.default;

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
  Object.assign(this.log, events.EventEmitter.prototype);

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

TestAdapter.prototype.prompt = function (questions, prefilledAnswers) {
  return this.promptModule(questions, prefilledAnswers);
};

module.exports = {
  DummyPrompt,
  TestAdapter
};
