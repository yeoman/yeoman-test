# yeoman-test

[![NPM version][npm-image]][npm-url]
[![NPM Test](https://github.com/yeoman/yeoman-test/workflows/NPM%20Test/badge.svg)](https://github.com/yeoman/yeoman-test/actions?query=workflow%3A%22NPM+Test%22)
[![Integration Build](https://github.com/yeoman/yeoman-test/workflows/Integration%20Build/badge.svg)](https://github.com/yeoman/yeoman-test/actions?query=workflow%3A%22Integration+Build%22)
[![Dependency Status][daviddm-image]][daviddm-url]
[![Coverage percentage][coveralls-image]][coveralls-url]

> Test utilities for Yeoman generators

## Installation

```sh
$ npm install --save-dev yeoman-test
```

Install target environment and generator:

```sh
$ npm install --save-dev yeoman-generator@xxx yeoman-environment@xxx
```

## Usage

Usage using the convenience last RunResult instance:

```js
import helpers, { result } from 'yeoman-test';

describe('generator test', () => {
  describe('test', () => {
    beforeEach(async () => {
      await helpers
        .run(                   // instantiates RunContext
          'namespace',             // namespace or generator
          {},                      // test options
          {}                       // environment options
        )
        [.cd(dir)]                  // runs the test inside a non temporary dir
        [.onTargetDirectory(dir => {})        // prepares the test dir
        [.withGenerators([])]       // registers additional generators
        [.withLookups({})]          // runs Environment lookups
        [.withOptions({})]          // passes options to the generator
        [.withLocalConfig({})]      // sets the generator config as soon as it is instantiated
        [.withAnswers()]            // simulates the prompt answers
        [.withMockedGenerators(['namespace', ...])]      // adds a mocked generator to the namespaces
        [.withFiles({
          'foo.txt': 'bar',
          'test.json', { content: true },
        })]                         // add files to mem-fs
        [.withYoRc({ 'generator-foo': { bar: {} } })]    // add config to .yo-rc.json
        [.withYoRcConfig('generator-foo.bar', { : {} })] // same as above
        [.commitFiles()]            // commit mem-fs files to disk
        [.onGenerator(gen => {})]   // do something with the generator
        [.onEnvironment(env => {})]; // do something with the environment

      [await result.create('another-generator').run();] // instantiates a new RunContext at the same directory
    );

    it('runs correctly', () => {
      // runs assertions using mem-fs.
      [result.assertFile('file.txt');]
      [result.assertNoFile('file.txt');]
      [result.assertFileContent('file.txt', 'content');]
      [result.assertEqualsFileContent('file.txt', 'content');]
      [result.assertNoFileContent('file.txt', 'content');]
      [result.assertJsonFileContent('file.txt', {});]
      [result.assertNoJsonFileContent('file.txt', {});]
    });
  });
});
```

Generator compose:

```js
import assert from 'assert';
import helpers, { result } from 'yeoman-test';

describe('my-gen', () => {
  before(() => helpers.run('my-gen').withMockedGenerator(['composed-gen']));
  it('should compose with composed-gen', () => {
    assert(result.mockedGenerators['composed-gen'].calledOnce);
  });
});
```

Generic test folder:

```js
import helpers, { result } from 'yeoman-test';

describe('generic test', () => {
  before(() => helpers.prepareTemporaryDir());
  it('test', () => {
    result.assert...;
  });
});
```

[See our api documentation](https://yeoman.github.io/yeoman-test) for latest yeoman-test release.

[See our api documentation](https://yeoman.github.io/yeoman-test/5.0.1) for yeoman-test 5.0.1. Use 5.x for yeoman-environment 2.x support.

[See our api documentation](https://yeoman.github.io/yeoman-test/2.x) for yeoman-test 2.x.

[See our documentation](http://yeoman.io/authoring/testing.html) for yeoman-test 2.x.

## License

MIT © [The Yeoman Team](http://yeoman.io)

[npm-image]: https://badge.fury.io/js/yeoman-test.svg
[npm-url]: https://npmjs.org/package/yeoman-test
[travis-image]: https://travis-ci.org/yeoman/yeoman-test.svg?branch=master
[travis-url]: https://travis-ci.org/yeoman/yeoman-test
[daviddm-image]: https://david-dm.org/yeoman/yeoman-test.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/yeoman/yeoman-test
[coveralls-image]: https://coveralls.io/repos/yeoman/yeoman-test/badge.svg
[coveralls-url]: https://coveralls.io/r/yeoman/yeoman-test
