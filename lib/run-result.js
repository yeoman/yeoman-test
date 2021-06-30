'use strict';
const assert = require('assert');
const fs = require('fs');
const MemFsEditor = require('mem-fs-editor');
const path = require('path');

const helpers = require('.');

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
 * This class provides utilities for testing generated content.
 */

class RunResult {
  constructor(options = {cwd: process.cwd()}) {
    this.env = options.env;
    this.generator = options.generator;
    this.cwd = options.cwd;
    this.oldCwd = options.oldCwd;
    this.memFs = options.memFs;
    this.fs = this.memFs && MemFsEditor.create(this.memFs);
    this.mockedGenerators = options.mockedGenerators || {};
    this.options = options;
    if (this.memFs && !this.cwd) {
      throw new Error('CWD option is required for mem-fs tests');
    }
  }

  /**
   * Create another RunContext reusing the settings.
   * See helpers.create api
   */
  create(GeneratorOrNamespace, settings, envOptions) {
    return helpers.create(
      GeneratorOrNamespace,
      {
        ...this.options.settings,
        cwd: this.cwd,
        oldCwd: this.oldCwd,
        ...settings
      },
      {...this.options.envOptions, memFs: this.memFs, ...envOptions}
    );
  }

  /**
   * Return an object with fs changes.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   * @returns {Object}
   */
  getSnapshot(filter) {
    return this.fs.dump(this.cwd, filter);
  }

  /**
   * Return an object with filenames with state.
   * @param {Function} filter - parameter forwarded to mem-fs-editor#dump
   * @returns {Object}
   */
  getStateSnapshot(filter) {
    const snapshot = this.getSnapshot(filter);
    Object.values(snapshot).forEach((dump) => {
      delete dump.contents;
    });
    return snapshot;
  }

  /**
   * Prints files names and contents from mem-fs
   * @param {...string} files - Files to print or empty for entire mem-fs
   * @returns {RunResult} this
   */
  dumpFiles(...files) {
    if (files.length === 0) {
      this.memFs.each((file) => {
        console.log(file.path);
        if (file.contents) {
          console.log(file.contents.toString('utf8'));
        }
      });
      return this;
    }

    files.forEach((file) => {
      console.log(this.fs.read(this._fileName(file)));
    });
    return this;
  }

  /**
   * Prints every file from mem-fs
   * @returns {RunResult} this
   */
  dumpFilenames() {
    this.memFs.each((file) => {
      console.log(file.path);
    });
    return this;
  }

  /**
   * Reverts to old cwd.
   * @returns {RunResult} this
   */
  restore() {
    process.chdir(this.oldCwd);
    return this;
  }

  /**
   * Deletes the test directory recursively.
   * @returns {RunResult} this
   */
  cleanup() {
    process.chdir(this.oldCwd);
    fs.rmdirSync(this.cwd, {recursive: true});
    return this;
  }

  _fileName(filename) {
    if (path.isAbsolute(filename)) {
      return filename;
    }

    return path.join(this.cwd, filename);
  }

  _readFile(filename, json) {
    filename = this._fileName(filename);
    let file;
    if (this.fs) {
      file = this.fs.read(filename, 'utf8');
    } else {
      file = fs.readFileSync(filename, 'utf8');
    }

    return json ? JSON.parse(file) : file;
  }

  _exists(filename) {
    filename = this._fileName(filename);
    if (this.fs) {
      return this.fs.exists(filename);
    }

    return fs.existsSync(filename);
  }

  /**
   * Assert that a file exists
   * @param {String}       path     - path to a file
   * @example
   * result.assertFile('templates/user.hbs');
   *
   * @also
   *
   * Assert that each files in the array exists
   * @param {Array}         paths    - an array of paths to files
   * @example
   * result.assertFile(['templates/user.hbs', 'templates/user/edit.hbs']);
   */
  assertFile() {
    convertArgs(arguments).forEach((file) => {
      const here = this._exists(file);
      assert.ok(here, `${file}, no such file or directory`);
    });
  }

  /**
   * Assert that a file doesn't exist
   * @param {String}       file     - path to a file
   * @example
   * result.assertNoFile('templates/user.hbs');
   *
   * @also
   *
   * Assert that each of an array of files doesn't exist
   * @param {Array}         pairs    - an array of paths to files
   * @example
   * result.assertNoFile(['templates/user.hbs', 'templates/user/edit.hbs']);
   */
  assertNoFile() {
    convertArgs(arguments).forEach((file) => {
      const here = this._exists(file);
      assert.ok(!here, `${file} exists`);
    });
  }

  /**
   * Assert that a file's content matches a regex or string
   * @param {String}       file     - path to a file
   * @param {Regex|String} reg      - regex / string that will be used to search the file
   * @example
   * result.assertFileContent('models/user.js', /App\.User = DS\.Model\.extend/);
   * result.assertFileContent('models/user.js', 'App.User = DS.Model.extend');
   *
   * @also
   *
   * Assert that each file in an array of file-regex pairs matches its corresponding regex
   * @param {Array}         pairs    - an array of arrays, where each subarray is a [String, RegExp] pair
   * @example
   * var arg = [
   *   [ 'models/user.js', /App\.User = DS\.Model\.extend/ ],
   *   [ 'controllers/user.js', /App\.UserController = Ember\.ObjectController\.extend/ ]
   * ]
   * result.assertFileContent(arg);
   */

  assertFileContent() {
    convertArgs(arguments).forEach((pair) => {
      const file = pair[0];
      const regex = pair[1];
      this.assertFile(file);
      const body = this._readFile(file);

      let match = false;
      if (typeof regex === 'string') {
        match = body.includes(regex);
      } else {
        match = regex.test(body);
      }

      assert(match, `${file} did not match '${regex}'. Contained:\n\n${body}`);
    });
  }

  /**
   * Assert that a file's content is the same as the given string
   * @param {String}  file            - path to a file
   * @param {String}  expectedContent - the expected content of the file
   * @example
   * result.assertEqualsFileContent(
   *   'data.js',
   *   'const greeting = "Hello";\nexport default { greeting }'
   * );
   *
   * @also
   *
   * Assert that each file in an array of file-string pairs equals its corresponding string
   * @param {Array}   pairs           - an array of arrays, where each subarray is a [String, String] pair
   * @example
   * result.assertEqualsFileContent([
   *   ['data.js', 'const greeting = "Hello";\nexport default { greeting }'],
   *   ['user.js', 'export default {\n  name: 'Coleman',\n  age: 0\n}']
   * ]);
   */

  assertEqualsFileContent() {
    convertArgs(arguments).forEach((pair) => {
      const file = pair[0];
      const expectedContent = pair[1];
      this.assertFile(file);
      this.assertTextEqual(this._readFile(file), expectedContent);
    });
  }

  /**
   * Assert that a file's content does not match a regex / string
   * @param {String}       file     - path to a file
   * @param {Regex|String} reg      - regex / string that will be used to search the file
   * @example
   * result.assertNoFileContent('models/user.js', /App\.User = DS\.Model\.extend/);
   * result.assertNoFileContent('models/user.js', 'App.User = DS.Model.extend');
   *
   * @also
   *
   * Assert that each file in an array of file-regex pairs does not match its corresponding regex
   * @param {Array}         pairs    - an array of arrays, where each subarray is a [String, RegExp] pair
   * var arg = [
   *   [ 'models/user.js', /App\.User \ DS\.Model\.extend/ ],
   *   [ 'controllers/user.js', /App\.UserController = Ember\.ObjectController\.extend/ ]
   * ]
   * result.assertNoFileContent(arg);
   */

  assertNoFileContent() {
    convertArgs(arguments).forEach((pair) => {
      const file = pair[0];
      const regex = pair[1];
      this.assertFile(file);
      const body = this._readFile(file);

      if (typeof regex === 'string') {
        assert.ok(!body.includes(regex), `${file} matched '${regex}'.`);
        return;
      }

      assert.ok(!regex.test(body), `${file} matched '${regex}'.`);
    });
  }

  /**
   * Assert that two strings are equal after standardization of newlines
   * @param {String} value    - a string
   * @param {String} expected - the expected value of the string
   * @example
   * result.assertTextEqual('I have a yellow cat', 'I have a yellow cat');
   */

  assertTextEqual(value, expected) {
    const eol = (string) => string.replace(/\r\n/g, '\n');

    assert.equal(eol(value), eol(expected));
  }

  /**
   * Assert an object contains the provided keys
   * @param {Object} obj      Object that should match the given pattern
   * @param {Object} content  An object of key/values the object should contains
   */

  assertObjectContent(object, content) {
    Object.keys(content).forEach((key) => {
      if (isObject(content[key])) {
        this.assertObjectContent(object[key], content[key]);
        return;
      }

      assert.equal(object[key], content[key]);
    });
  }

  /**
   * Assert an object does not contain the provided keys
   * @param {Object} obj Object that should not match the given pattern
   * @param {Object} content An object of key/values the object should not contain
   */

  assertNoObjectContent(object, content) {
    Object.keys(content).forEach((key) => {
      if (isObject(content[key])) {
        this.assertNoObjectContent(object[key], content[key]);
        return;
      }

      assert.notEqual(object[key], content[key]);
    });
  }

  /**
   * Assert a JSON file contains the provided keys
   * @param {String} filename
   * @param {Object} content An object of key/values the file should contains
   */

  assertJsonFileContent(filename, content) {
    this.assertObjectContent(this._readFile(filename, true), content);
  }

  /**
   * Assert a JSON file does not contain the provided keys
   * @param {String} filename
   * @param {Object} content An object of key/values the file should not contain
   */

  assertNoJsonFileContent(filename, content) {
    this.assertNoObjectContent(this._readFile(filename, true), content);
  }
}

module.exports = RunResult;
