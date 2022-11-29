import assert from 'node:assert';
import {existsSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import MemFsEditor, {type Editor} from 'mem-fs-editor';

import type {Store} from 'mem-fs';
import type Environment from 'yeoman-environment';
import type Generator from 'yeoman-generator';

import {type RunContextSettings} from './run-context.js';
import {type YeomanTest} from './helpers.js';

const isObject = (object) =>
  typeof object === 'object' && object !== null && object !== undefined;

function convertArgs(args) {
  if (args.length > 1) {
    return [[...args]];
  }

  const arg = args[0];
  return Array.isArray(arg) ? arg : [arg];
}

/**
 * Provides options for `RunResult`s.
 */
export type RunResultOptions<GeneratorType extends Generator> = {
  generator: GeneratorType;

  /**
   * The environment of the generator.
   */
  env: Environment;

  envOptions: Environment.Options;

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
  memFs: Store;

  fs?: MemFsEditor.Editor;

  /**
   * The mocked generators of the context.
   */
  mockedGenerators: Record<string, Generator>;

  settings: RunContextSettings;

  helpers: YeomanTest;
};

/**
 * This class provides utilities for testing generated content.
 */

export default class RunResult<GeneratorType extends Generator> {
  env: any;
  generator: GeneratorType;
  cwd: string;
  oldCwd: string;
  memFs: Store;
  fs: Editor;
  mockedGenerators: any;
  options: RunResultOptions<GeneratorType>;

  constructor(options: RunResultOptions<GeneratorType>) {
    if (options.memFs && !options.cwd) {
      throw new Error('CWD option is required for mem-fs tests');
    }

    this.env = options.env;
    this.generator = options.generator;
    this.cwd = options.cwd ?? process.cwd();
    this.oldCwd = options.oldCwd;
    this.memFs = options.memFs;
    this.fs = this.memFs && MemFsEditor.create(this.memFs);
    this.mockedGenerators = options.mockedGenerators || {};
    this.options = options;
  }

  /**
   * Create another RunContext reusing the settings.
   * See helpers.create api
   */
  create(GeneratorOrNamespace, settings, envOptions) {
    return this.options.helpers.create(
      GeneratorOrNamespace,
      {
        ...this.options.settings,
        cwd: this.cwd,
        oldCwd: this.oldCwd,
        ...settings,
        autoCleanup: false,
      },
      {...this.options.envOptions, memFs: this.memFs, ...envOptions},
    );
  }

  /**
   * Return an object with fs changes.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   */
  getSnapshot(
    filter?,
  ): Record<string, {contents: string; stateCleared: string}> {
    return (this.fs as any).dump(this.cwd, filter);
  }

  /**
   * Return an object with filenames with state.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   * @returns {Object}
   */
  getStateSnapshot(filter?): Record<string, {stateCleared: string}> {
    const snapshot = this.getSnapshot(filter);
    for (const dump of Object.values(snapshot)) {
      delete (dump as any).contents;
    }

    return snapshot;
  }

  /**
   * Either dumps the contents of the specified files or the name and the contents of each file to the console.
   */
  dumpFiles(...files: string[]): this {
    if (files.length === 0) {
      this.memFs.each((file) => {
        console.log(file.path);
        if (file.contents) {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
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
    this.memFs.each((file) => {
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
    rmSync(this.cwd, {recursive: true});
    return this;
  }

  _fileName(filename) {
    if (path.isAbsolute(filename)) {
      return filename;
    }

    return path.join(this.cwd, filename);
  }

  _readFile(filename, json?: boolean) {
    filename = this._fileName(filename);
    const file = this.fs
      ? this.fs.read(filename)
      : readFileSync(filename, 'utf8');

    return json ? JSON.parse(file) : file;
  }

  _exists(filename) {
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
    for (const file of convertArgs([path])) {
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
    for (const file of convertArgs([files])) {
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
  assertFileContent(...args) {
    for (const pair of convertArgs(args)) {
      const file = pair[0];
      const regex = pair[1];
      this.assertFile(file);
      const body = this._readFile(file);

      let match = false;
      match =
        typeof regex === 'string' ? body.includes(regex) : regex.test(body);

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
  assertEqualsFileContent(...args) {
    for (const pair of convertArgs(args)) {
      const file = pair[0];
      const expectedContent = pair[1];
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
  assertNoFileContent(...args) {
    for (const pair of convertArgs(args)) {
      const file = pair[0];
      const regex = pair[1];
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
    const eol = (string) => string.replace(/\r\n/g, '\n');

    assert.equal(eol(value), eol(expected));
  }

  /**
   * Assert an object contains the provided keys
   * @param obj      Object that should match the given pattern
   * @param content  An object of key/values the object should contains
   */
  assertObjectContent(
    object: Record<string, unknown>,
    content: Record<string, any>,
  ): void {
    for (const key of Object.keys(content)) {
      if (isObject(content[key])) {
        this.assertObjectContent(
          object[key] as Record<string, unknown>,
          content[key],
        );
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

  assertNoObjectContent(
    object: Record<string, unknown>,
    content: Record<string, any>,
  ): void {
    for (const key of Object.keys(content)) {
      if (isObject(content[key])) {
        this.assertNoObjectContent(
          object[key] as Record<string, unknown>,
          content[key],
        );
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

  assertNoJsonFileContent(
    filename: string,
    content: Record<string, any>,
  ): void {
    this.assertNoObjectContent(this._readFile(filename, true), content);
  }
}
