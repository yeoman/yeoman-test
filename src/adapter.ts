import { TestAdapter as BaseTestAdapter, type TestAdapterOptions } from '@yeoman/adapter/testing';
import { spy as sinonSpy, stub as sinonStub } from 'sinon';

export class TestAdapter extends BaseTestAdapter {
  constructor(options: TestAdapterOptions = {}) {
    super({
      spyFactory: ({ returns }) => (returns ? sinonStub().returns(returns) : sinonSpy()),
      ...options,
    });
  }
}

export { DummyPrompt, type DummyPromptOptions, type DummyPromptCallback, type TestAdapterOptions } from '@yeoman/adapter/testing';

export type AskedQuestions = Array<{ name: string; answer: any }>;
