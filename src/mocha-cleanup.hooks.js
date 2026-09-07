import { mock } from 'node:test';

import { context } from './index.js';

export const mochaHooks = {
  afterAll() {
    mock.reset();
    context.startNewContext();
  },
};
