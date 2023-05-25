import events from 'node:events';
import { PassThrough } from 'node:stream';
import { spy as sinonSpy, stub as sinonStub } from 'sinon';
import type { PromptAnswers, PromptQuestion, Logger, InputOutputAdapter, PromptQuestions } from '@yeoman/types';
import { createPromptModule, type PromptModule } from 'inquirer';

export type DummyPromptOptions = {
  mockedAnswers?: PromptAnswers;
  callback?: (answers: PromptAnswers) => PromptAnswers;
  throwOnMissingAnswer?: boolean;
};

export class DummyPrompt {
  answers: PromptAnswers;
  question: PromptQuestion;
  callback!: (answers: PromptAnswers) => PromptAnswers;
  throwOnMissingAnswer = false;

  constructor(question: PromptQuestion, _rl: any, answers: PromptAnswers, options: DummyPromptOptions = {}) {
    const { mockedAnswers, callback, throwOnMissingAnswer } = options;
    this.answers = { ...answers, ...mockedAnswers };
    this.question = question;

    this.callback = callback ?? (answers => answers);
    this.throwOnMissingAnswer = throwOnMissingAnswer ?? false;
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

export class TestAdapter implements InputOutputAdapter {
  promptModule: PromptModule;
  diff: any;
  log: Logger;

  constructor(promptOptions?: DummyPromptOptions) {
    this.promptModule = createPromptModule({
      input: new PassThrough() as any,
      output: new PassThrough() as any,
      skipTTYChecks: true,
    });

    for (const promptName of Object.keys(this.promptModule.prompts)) {
      this.promptModule.registerPrompt(
        promptName,
        class CustomDummyPrompt extends DummyPrompt {
          constructor(question: PromptQuestion, rl: any, answers: PromptAnswers) {
            super(question, rl, answers, promptOptions);
          }
        } as any,
      );
    }

    this.diff = sinonSpy();
    this.log = sinonSpy() as any;
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
      (this.log as any)[methodName] = sinonStub().returns(this.log);
    }
  }

  close(): void {
    this.promptModule.restoreDefaultPrompts();
  }

  async prompt<A extends PromptAnswers = PromptAnswers>(
    questions: PromptQuestions<A>,
    initialAnswers?: Partial<A> | undefined,
  ): Promise<A> {
    return this.promptModule(questions, initialAnswers);
  }
}
