import { context } from './index.js';

export const mochaHooks = {
  afterAll() {
    context.startNewContext();
  },
};
