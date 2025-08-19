import assert from 'node:assert';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { type mock } from 'node:test';
import type { Store } from 'mem-fs';
import { type MemFsEditor, type MemFsEditorFile, create as createMemFsEditor } from 'mem-fs-editor';
import type { BaseEnvironmentOptions, BaseGenerator, GetGeneratorConstructor } from '@yeoman/types';
import type { DefaultEnvironmentApi } from '../types/type-helpers.js';
import { type RunContextSettings } from './run-context.js';
import { type YeomanTest } from './helpers.js';
import { type AskedQuestions } from './adapter.js';

const isObject = (object: any) => typeof object === 'object' && object !== null && object !== undefined;

function convertArguments<T>(arguments_: T[] | T[][]): T[] {
  if (arguments_.length > 1) {
    return [[...arguments_]] as T[];
  }

  const [argument] = arguments_;
  return Array.isArray(argument) ? argument : [argument];
}

/**
 * Provides options for `RunResult`s.
 */
export type RunResultOptions<GeneratorType extends BaseGenerator> = {
  generator: GeneratorType;

  /**
   * The environment of the generator.
   */
  env: DefaultEnvironmentApi;

  envOptions: BaseEnvironmentOptions;

  /**
   * The working directory after running the generator.
   */
  cwd: string;

  /**
   * The working directory before on running the generator.
   */
  oldCwd: string;

  /**
   * The file-system of the generator.
   */
  memFs: Store<MemFsEditorFile>;

  fs?: MemFsEditor;

  /**
   * The mocked generators of the context.
   */
  mockedGenerators: Record<string, BaseGenerator>;

  spawnStub?: any;

  settings: RunContextSettings;

  helpers: YeomanTest;

  askedQuestions: AskedQuestions;
};

/**
 * This class provides utilities for testing generated content.
 */

export default class RunResult<GeneratorType extends BaseGenerator = BaseGenerator> {
  env: any;
  generator: GeneratorType;
  cwd: string;
  oldCwd: string;
  memFs: Store<MemFsEditorFile>;
  fs: MemFsEditor;
  mockedGenerators: any;
  options: RunResultOptions<GeneratorType>;
  spawnStub?: any;
  readonly askedQuestions: AskedQuestions;

  constructor(options: RunResultOptions<GeneratorType>) {
    if (options.memFs && !options.cwd) {
      throw new Error('CWD option is required for mem-fs tests');
    }

    this.env = options.env;
    this.generator = options.generator;
    this.cwd = options.cwd ?? process.cwd();
    this.oldCwd = options.oldCwd;
    this.memFs = options.memFs;
    this.fs = this.memFs && createMemFsEditor(this.memFs);
    this.mockedGenerators = options.mockedGenerators || {};
    this.spawnStub = options.spawnStub;
    this.askedQuestions = options.askedQuestions;
    this.options = options;
  }

  /**
   * Create another RunContext reusing the settings.
   * See helpers.create api
   */
  create<G extends BaseGenerator = GeneratorType>(
    GeneratorOrNamespace: string | GetGeneratorConstructor<G>,
    settings?: RunContextSettings,
    environmentOptions?: BaseEnvironmentOptions,
  ) {
    return this.options.helpers.create(
      GeneratorOrNamespace,
      {
        ...this.options.settings,
        cwd: this.cwd,
        oldCwd: this.oldCwd,
        memFs: this.memFs,
        ...settings,
        autoCleanup: false,
      },
      { ...this.options.envOptions, ...environmentOptions },
    );
  }

  getSpawnArgsUsingDefaultImplementation() {
    if (!this.spawnStub) {
      throw new Error('Spawn stub was not found');
    }

    return (this.spawnStub as ReturnType<typeof mock.fn>).mock.calls.map(call => call.arguments);
  }

  /**
   * Return an object with fs changes.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   */
  getSnapshot(filter?: Parameters<MemFsEditor['dump']>[1]): Record<string, { contents: string; stateCleared: string }> {
    return this.fs.dump(this.cwd, filter);
  }

  /**
   * Return an object with filenames with state.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   */
  getStateSnapshot(filter?: Parameters<MemFsEditor['dump']>[1]): Record<string, { stateCleared?: string; state?: string }> {
    const snapshot: Record<string, { contents?: string; stateCleared?: string; state?: string }> = this.getSnapshot(filter);
    for (const dump of Object.values(snapshot)) {
      delete dump.contents;
    }

    return snapshot;
  }

  /**
   * Either dumps the contents of the specified files or the name and the contents of each file to the console.
   */
  dumpFiles(...files: string[]): this {
    if (files.length === 0) {
      this.memFs.each(file => {
        console.log(file.path);
        if (file.contents) {
          console.log(file.contents.toString('utf8'));
        }
      });
      return this;
    }

    for (const file of files) {
      console.log(this.fs.read(this._fileName(file)));
    }

    return this;
  }

  /**
   * Dumps the name of each file to the console.
   */
  dumpFilenames(): this {
    this.memFs.each(file => {
      console.log(file.path);
    });
    return this;
  }

  /**
   * Reverts to old cwd.
   * @returns this
   */
  restore(): this {
    process.chdir(this.oldCwd);
    return this;
  }

  /**
   * Deletes the test directory recursively.
   */
  cleanup(): this {
    process.chdir(this.oldCwd);
    rmSync(this.cwd, { recursive: true });
    return this;
  }

  _fileName(filename: string) {
    if (path.isAbsolute(filename)) {
      return filename;
    }

    return path.join(this.cwd, filename);
  }

  _readFile(filename: string, json?: boolean) {
    filename = this._fileName(filename);
    const file = (this.fs ? this.fs.read(filename) : undefined) ?? readFileSync(filename, 'utf8');

    return json ? JSON.parse(file) : file;
  }

  _exists(filename: string) {
    filename = this._fileName(filename);
    if (this.fs) {
      return this.fs.exists(filename);
    }

    return existsSync(filename);
  }

  /**
   * Assert that a file exists
   * @param path     - path to a file
   * @example
   * result.assertFile('templates/user.hbs');
   *
   * @also
   *
   * Assert that each files in the array exists
   * @param paths    - an array of paths to files
   * @example
   * result.assertFile(['templates/user.hbs', 'templates/user/edit.hbs']);
   */
  assertFile(path: string | string[]): void {
    for (const file of Array.isArray(path) ? path : [path]) {
      const here = this._exists(file);
      assert.ok(here, `${file}, no such file or directory`);
    }
  }

  /**
   * Assert that a file doesn't exist
   * @param file     - path to a file
   * @example
   * result.assertNoFile('templates/user.hbs');
   *
   * @also
   *
   * Assert that each of an array of files doesn't exist
   * @param pairs    - an array of paths to files
   * @example
   * result.assertNoFile(['templates/user.hbs', 'templates/user/edit.hbs']);
   */
  assertNoFile(files: string | string[]): void {
    for (const file of Array.isArray(files) ? files : [files]) {
      const here = this._exists(file);
      assert.ok(!here, `${file} exists`);
    }
  }

  /**
   * Assert that a file's content matches a regex or string
   * @param file     - path to a file
   * @param reg      - regex / string that will be used to search the file
   * @example
   * result.assertFileContent('models/user.js', /App\.User = DS\.Model\.extend/);
   * result.assertFileContent('models/user.js', 'App.User = DS.Model.extend');
   *
   * @also
   *
   * Assert that each file in an array of file-regex pairs matches its corresponding regex
   * @param pairs    - an array of arrays, where each subarray is a [String, RegExp] pair
   * @example
   * var arg = [
   *   [ 'models/user.js', /App\.User = DS\.Model\.extend/ ],
   *   [ 'controllers/user.js', /App\.UserController = Ember\.ObjectController\.extend/ ]
   * ]
   * result.assertFileContent(arg);
   */
  assertFileContent(file: string, reg: string | RegExp): void;
  assertFileContent(pairs: Array<[string, string | RegExp]>): void;
  assertFileContent(...arguments_: any[]) {
    for (const pair of convertArguments(arguments_)) {
      const [file, regex] = pair;
      this.assertFile(file);
      const body = this._readFile(file);

      let match = false;
      match = typeof regex === 'string' ? body.includes(regex) : regex.test(body);

      assert(match, `${file} did not match '${regex}'. Contained:\n\n${body}`);
    }
  }

  /**
   * Assert that a file's content is the same as the given string
   * @param file            - path to a file
   * @param expectedContent - the expected content of the file
   * @example
   * result.assertEqualsFileContent(
   *   'data.js',
   *   'const greeting = "Hello";\nexport default { greeting }'
   * );
   *
   * @also
   *
   * Assert that each file in an array of file-string pairs equals its corresponding string
   * @param pairs           - an array of arrays, where each subarray is a [String, String] pair
   * @example
   * result.assertEqualsFileContent([
   *   ['data.js', 'const greeting = "Hello";\nexport default { greeting }'],
   *   ['user.js', 'export default {\n  name: 'Coleman',\n  age: 0\n}']
   * ]);
   */
  assertEqualsFileContent(file: string, expectedContent: string): void;
  assertEqualsFileContent(pairs: Array<[string, string]>): void;
  assertEqualsFileContent(...arguments_: any[]) {
    for (const pair of convertArguments(arguments_)) {
      const [file, expectedContent] = pair;
      this.assertFile(file);
      this.assertTextEqual(this._readFile(file), expectedContent);
    }
  }

  /**
   * Assert that a file's content does not match a regex / string
   * @param file     - path to a file
   * @param reg      - regex / string that will be used to search the file
   * @example
   * result.assertNoFileContent('models/user.js', /App\.User = DS\.Model\.extend/);
   * result.assertNoFileContent('models/user.js', 'App.User = DS.Model.extend');
   *
   * @also
   *
   * Assert that each file in an array of file-regex pairs does not match its corresponding regex
   * @param pairs    - an array of arrays, where each subarray is a [String, RegExp] pair
   * var arg = [
   *   [ 'models/user.js', /App\.User \ DS\.Model\.extend/ ],
   *   [ 'controllers/user.js', /App\.UserController = Ember\.ObjectController\.extend/ ]
   * ]
   * result.assertNoFileContent(arg);
   */
  assertNoFileContent(file: string, reg: RegExp | string): void;
  assertNoFileContent(pairs: Array<[string, string | RegExp]>): void;
  assertNoFileContent(...arguments_: any[]) {
    for (const pair of convertArguments(arguments_)) {
      const [file, regex] = pair;
      this.assertFile(file);
      const body = this._readFile(file);

      if (typeof regex === 'string') {
        assert.ok(!body.includes(regex), `${file} matched '${regex}'.`);
        continue;
      }

      assert.ok(!regex.test(body), `${file} matched '${regex}'.`);
    }
  }

  /**
   * Assert that two strings are equal after standardization of newlines
   * @param value    - a string
   * @param expected - the expected value of the string
   * @example
   * result.assertTextEqual('I have a yellow cat', 'I have a yellow cat');
   */
  assertTextEqual(value: string, expected: string): void {
    const eol = (string: string) => string.replaceAll('\r\n', '\n');

    assert.equal(eol(value), eol(expected));
  }

  /**
   * Assert an object contains the provided keys
   * @param obj      Object that should match the given pattern
   * @param content  An object of key/values the object should contains
   */
  assertObjectContent(object: Record<string, unknown>, content: Record<string, any>): void {
    for (const key of Object.keys(content)) {
      if (isObject(content[key])) {
        this.assertObjectContent(object[key] as Record<string, unknown>, content[key]);
        continue;
      }

      assert.equal(object[key], content[key]);
    }
  }

  /**
   * Assert an object does not contain the provided keys
   * @param obj Object that should not match the given pattern
   * @param content An object of key/values the object should not contain
   */

  assertNoObjectContent(object: Record<string, unknown>, content: Record<string, any>): void {
    for (const key of Object.keys(content)) {
      if (isObject(content[key])) {
        this.assertNoObjectContent(object[key] as Record<string, unknown>, content[key]);
        continue;
      }

      assert.notEqual(object[key], content[key]);
    }
  }

  /**
   * Assert a JSON file contains the provided keys
   * @param filename
   * @param content An object of key/values the file should contains
   */

  assertJsonFileContent(filename: string, content: Record<string, any>): void {
    this.assertObjectContent(this._readFile(filename, true), content);
  }

  /**
   * Assert a JSON file does not contain the provided keys
   * @param filename
   * @param content An object of key/values the file should not contain
   */

  assertNoJsonFileContent(filename: string, content: Record<string, any>): void {
    this.assertNoObjectContent(this._readFile(filename, true), content);
  }

  /**
   * Get the generator mock
   * @param generator - the namespace of the mocked generator
   * @returns the generator mock
   */
  getGeneratorMock(generator: string): ReturnType<typeof mock.fn>['mock'] {
    const mockedGenerator: ReturnType<typeof mock.fn> = this.mockedGenerators[generator];
    if (!mockedGenerator) {
      throw new Error(`Generator ${generator} is not mocked`);
    }
    return mockedGenerator.mock;
  }

  /**
   * Get the number of times a mocked generator was composed
   * @param generator - the namespace of the mocked generator
   * @returns the number of times the generator was composed
   */
  getGeneratorComposeCount(generator: string): number {
    return this.getGeneratorMock(generator).callCount();
  }

  /**
   * Assert that a generator was composed
   * @param generator - the namespace of the mocked generator
   */
  assertGeneratorComposed(generator: string): void {
    assert.ok(this.getGeneratorComposeCount(generator) > 0, `Generator ${generator} is not composed`);
  }

  /**
   * Assert that a generator was composed
   * @param generator - the namespace of the mocked generator
   */
  assertGeneratorNotComposed(generator: string): void {
    const composeCount = this.getGeneratorComposeCount(generator);
    assert.ok(composeCount === 0, `Generator ${generator} is composed ${composeCount}`);
  }

  /**
   * Assert that a generator was composed only once
   * @param generator - the namespace of the mocked generator
   */
  assertGeneratorComposedOnce(generator: string): void {
    assert.ok(this.getGeneratorComposeCount(generator) === 1, `Generator ${generator} is not composed`);
  }

  /**
   * Assert that a generator was composed multiple times
   * @returns an array of the names of the mocked generators that were composed
   */
  getComposedGenerators(): string[] {
    return Object.entries(this.mockedGenerators)
      .filter(([_generator, mockedGenerator]) => (mockedGenerator as any).mock.callCount() > 0)
      .map(([generator]) => generator);
  }
}
