/* eslint-disable max-params */
import events from 'node:events';
import {PassThrough} from 'node:stream';
import inquirer, {type prompts} from 'inquirer';
import {spy as sinonSpy, stub as sinonStub} from 'sinon';
import type Generator from 'yeoman-generator';
import type Logger from 'yeoman-environment/lib/util/log.js';

export class DummyPrompt {
  answers: Generator.Answers;
  question: inquirer.Question;
  callback!: (answers: Generator.Answers) => Generator.Answers;
  throwOnMissingAnswer = false;

  constructor(mockedAnswers, options, question, _rl, answers) {
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

  async run() {
    let answer = this.answers[this.question.name!];
    let isSet;

    switch (this.question.type) {
      case 'list': {
        // List prompt accepts any answer value including null
        isSet = answer !== undefined;
        break;
      }

      case 'confirm': {
        // Ensure that we don't replace `false` with default `true`
        isSet = answer || answer === false;
        break;
      }

      default: {
        // Other prompts treat all falsy values to default
        isSet = Boolean(answer);
      }
    }

    if (!isSet) {
      if (answer === undefined && this.question.default === undefined) {
        const missingAnswerMessage = `yeoman-test: question ${this.question.name} was asked but answer was not provided`;
        console.warn(missingAnswerMessage);
        if (this.throwOnMissingAnswer) {
          throw new Error(missingAnswerMessage);
        }
      }

      answer = this.question.default;

      if (answer === undefined && this.question.type === 'confirm') {
        answer = true;
      }
    }

    return this.callback(answer);
  }
}

export class TestAdapter {
  promptModule: inquirer.PromptModule;
  diff: any;
  log: typeof Logger;

  constructor(mockedAnswers?) {
    this.promptModule = inquirer.createPromptModule({
      input: new PassThrough() as any,
      output: new PassThrough() as any,
      skipTTYChecks: true,
    });

    for (const promptName of Object.keys(this.promptModule.prompts)) {
      this.promptModule.registerPrompt(
        promptName,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question, rl, answers) {
            super(mockedAnswers, undefined, question, rl, answers);
          }
        } as any,
      );
    }

    this.diff = sinonSpy();
    this.log = sinonSpy();
    Object.assign(this.log, events.EventEmitter.prototype);

    // Make sure all log methods are defined
    const adapterMethods = [
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
      'table',
    ];
    for (const methodName of adapterMethods) {
      this.log[methodName] = sinonStub().returns(this.log);
    }
  }

  prompt(questions, prefilledAnswers) {
    return this.promptModule(questions, prefilledAnswers);
  }
}
