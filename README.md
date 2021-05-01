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

Usage:

```js
describe('generator test', () => {
  describe('test', () => {
    let runResult;
    beforeEach(async () => {
      runResult = await helpers
        .create(                   // instantiates RunContext
          'namespace',             // namespace or generator
          {},                      // test options
          {}                       // environment options
        )
        [.cd(dir)]                  // runs the test inside a non temporary dir
        [.doInDir(dir => {})        // prepares the test dir
        [.withGenerators([])]       // registers additional generators
        [.withLookups({})]          // runs Environment lookups
        [.withOptions({})]          // passes options to the generator
        [.withLocalConfig({})]      // sets the generator config as soon as it is instantiated
        [.withPrompts()]            // simulates the prompt answers
        [.build(runContext => {     // instantiates Environment/Generator
          [runContext.env...]       // does something with the environment
          [runContext.generator...] // does something with the generator
        })]
        .run();                     // runs the environment, promises a RunResult
      [result.create().run()] // instantiates a new RunContext at the same directory
    );
    afterEach(() => {
      if (runResult) {
        runResult.restore();
      }
    });
    it('runs correctly', () => {
      // runs assertions using mem-fs.
      [runResult.assertFile('file.txt');]
      [runResult.assertNoFile('file.txt');]
      [runResult.assertFileContent('file.txt', 'content');]
      [runResult.assertEqualsFileContent('file.txt', 'content');]
      [runResult.assertNoFileContent('file.txt', 'content');]
      [runResult.assertJsonFileContent('file.txt', {});]
      [runResult.assertNoJsonFileContent('file.txt', {});]
    });
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
