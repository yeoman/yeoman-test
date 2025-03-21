import { setDefaultDummyParentClass } from './helpers.js';

let GeneratorImplementation;
try {
  const GeneratorImport = await import('yeoman-generator');
  GeneratorImplementation = GeneratorImport.default ?? GeneratorImport;
  setDefaultDummyParentClass(GeneratorImplementation);
} catch {
  // ignore
}

export * from './index.js';
export { default } from './index.js';
