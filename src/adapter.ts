import { mock } from 'node:test';
import { TestAdapter as BaseTestAdapter, type TestAdapterOptions } from '@yeoman/adapter/testing';

export class TestAdapter extends BaseTestAdapter {
  constructor(options: TestAdapterOptions = {}) {
    super({
      spyFactory: ({ returns }) =>
        returns
          ? mock.fn(
              () => undefined,
              () => returns,
            )
          : mock.fn(),
      ...options,
    });
  }
}

export { DummyPrompt, type DummyPromptOptions, type DummyPromptCallback, type TestAdapterOptions } from '@yeoman/adapter/testing';

export type AskedQuestions = Array<{ name: string; answer: any }>;
