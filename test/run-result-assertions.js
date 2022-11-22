import path, {dirname} from 'node:path';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import MemFs from 'mem-fs';

import RunResult from '../lib/run-result.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('run-result-assertions', () => {
  const memFs = MemFs.create();

  for (const testFs of [
    {
      description: 'using memory fs',
      options: {memFs},
      verify(runResult) {
        assert(runResult.fs);
      },
    },
    {
      description: 'using node fs',
      verify(runResult) {
        assert(!runResult.fs);
      },
    },
  ]) {
    const yoAssert = new RunResult({
      ...testFs.options,
      cwd: path.join(__dirname, 'fixtures/assert'),
    });

    describe(testFs.description, () => {
      it('fs is correct', () => {
        testFs.verify(yoAssert);
      });
      describe('.assertFile()', () => {
        it('accept a file that exists', () => {
          assert.doesNotThrow(yoAssert.assertFile.bind(yoAssert, 'testFile'));
        });

        it('accept an array of files all of which exist', () => {
          assert.doesNotThrow(
            yoAssert.assertFile.bind(yoAssert, ['testFile', 'testFile2']),
          );
        });

        it('reject a file that does not exist', () => {
          assert.throws(yoAssert.assertFile.bind(yoAssert, 'etherealTestFile'));
        });

        it('reject multiple files one of which does not exist', () => {
          assert.throws(
            yoAssert.assertFile.bind(yoAssert, [
              'testFile',
              'intangibleTestFile',
            ]),
          );
        });
      });

      describe('.assertNoFile()', () => {
        it('accept a file that does not exist', () => {
          assert.doesNotThrow(
            yoAssert.assertNoFile.bind(yoAssert, 'etherealTestFile'),
          );
        });

        it('accept an array of files all of which do not exist', () => {
          assert.doesNotThrow(
            yoAssert.assertNoFile.bind(yoAssert, [
              'etherealTestFile',
              'intangibleTestFile',
            ]),
          );
        });

        it('reject a file that exists', () => {
          assert.throws(yoAssert.assertNoFile.bind(yoAssert, 'testFile'));
        });

        it('reject an array of files one of which exists', () => {
          assert.throws(
            yoAssert.assertNoFile.bind(yoAssert, [
              'testFile',
              'etherealTestFile',
            ]),
          );
        });
      });

      describe('.assertFileContent()', () => {
        it('accept a file and regex when the file content matches the regex', () => {
          assert.doesNotThrow(
            yoAssert.assertFileContent.bind(
              yoAssert,
              'testFile',
              /Roses are red/,
            ),
          );
        });

        it('accept a file and string when the file contains the string', () => {
          assert.doesNotThrow(
            yoAssert.assertFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are red',
            ),
          );
        });

        it('reject a file and regex when the file content does not match the regex', () => {
          assert.throws(
            yoAssert.assertFileContent.bind(
              yoAssert,
              'testFile',
              /Roses are blue/,
            ),
          );
        });

        it('reject a file and string when the file content does not contain the string', () => {
          assert.throws(
            yoAssert.assertFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are blue',
            ),
          );
        });

        it("accept an array of file/regex pairs when each file's content matches the corresponding regex", () => {
          const arg = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are blue/],
          ];
          assert.doesNotThrow(yoAssert.assertFileContent.bind(yoAssert, arg));
        });

        it("reject an array of file/regex pairs when one file's content does not matches the corresponding regex", () => {
          const arg = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are orange/],
          ];
          assert.throws(yoAssert.assertFileContent.bind(yoAssert, arg));
        });
      });

      describe('.assertEqualsFileContent()', () => {
        it('accept a file and string when the file content equals the string', () => {
          assert.doesNotThrow(
            yoAssert.assertEqualsFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are red.\n',
            ),
          );
        });

        it('reject a file and string when the file content does not equal the string', () => {
          assert.throws(
            yoAssert.assertEqualsFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are red',
            ),
          );
        });

        it("accept an array of file/string pairs when each file's content equals the corresponding string", () => {
          const arg = [
            ['testFile', 'Roses are red.\n'],
            ['testFile2', 'Violets are blue.\n'],
          ];
          assert.doesNotThrow(
            yoAssert.assertEqualsFileContent.bind(yoAssert, arg),
          );
        });

        it("reject an array of file/string pairs when one file's content does not equal the corresponding string", () => {
          const arg = [
            ['testFile', 'Roses are red.\n'],
            ['testFile2', 'Violets are green.\n'],
          ];
          assert.throws(yoAssert.assertEqualsFileContent.bind(yoAssert, arg));
        });
      });

      describe('.assertNoFileContent()', () => {
        it('accept a file and regex when the file content does not match the regex', () => {
          assert.doesNotThrow(
            yoAssert.assertNoFileContent.bind(
              yoAssert,
              'testFile',
              /Roses are blue/,
            ),
          );
        });

        it('accept a file and string when the file content does not contain the string', () => {
          assert.doesNotThrow(
            yoAssert.assertNoFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are blue',
            ),
          );
        });

        it('reject a file and regex when the file content matches the regex', () => {
          assert.throws(
            yoAssert.assertNoFileContent.bind(
              yoAssert,
              'testFile',
              /Roses are red/,
            ),
          );
        });

        it('reject a file and string when the file content contain the string', () => {
          assert.throws(
            yoAssert.assertNoFileContent.bind(
              yoAssert,
              'testFile',
              'Roses are red',
            ),
          );
        });

        it("accept an array of file/regex pairs when each file's content does not match its corresponding regex", () => {
          const arg = [
            ['testFile', /Roses are green/],
            ['testFile2', /Violets are orange/],
          ];
          assert.doesNotThrow(yoAssert.assertNoFileContent.bind(yoAssert, arg));
        });

        it("reject an array of file/regex pairs when one file's content does matches its corresponding regex", () => {
          const arg = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are orange/],
          ];
          assert.throws(yoAssert.assertNoFileContent.bind(yoAssert, arg));
        });
      });

      describe('.assertTextEqual()', () => {
        it('pass with two similar simple lines', () => {
          assert.doesNotThrow(
            yoAssert.assertTextEqual.bind(
              yoAssert,
              'I have a yellow cat',
              'I have a yellow cat',
            ),
          );
        });

        it('fails with two different simple lines', () => {
          assert.throws(
            yoAssert.assertTextEqual.bind(
              yoAssert,
              'I have a yellow cat',
              'I have a brown cat',
            ),
          );
        });

        it('pass with two similar simple lines with different new line types', () => {
          assert.doesNotThrow(
            yoAssert.assertTextEqual.bind(
              yoAssert,
              'I have a\nyellow cat',
              'I have a\r\nyellow cat',
            ),
          );
        });
      });

      describe('.assertObjectContent()', () => {
        it('pass if object contains the keys', () => {
          assert.doesNotThrow(
            yoAssert.assertObjectContent.bind(
              yoAssert,
              {
                a: 'foo',
              },
              {
                a: 'foo',
              },
            ),
          );
        });

        it('pass if object contains nested objects and arrays', () => {
          assert.doesNotThrow(
            yoAssert.assertObjectContent.bind(
              yoAssert,
              {
                a: {b: 'foo'},
                b: [0, 'a'],
                c: 'a',
              },
              {
                a: {b: 'foo'},
                b: [0, 'a'],
              },
            ),
          );
        });

        it('pass if array is incomplete', () => {
          assert.doesNotThrow(
            yoAssert.assertObjectContent.bind(
              yoAssert,
              {
                b: [0, 'a'],
              },
              {
                b: [0],
              },
            ),
          );
        });

        it('fails if object does not contain a key', () => {
          assert.throws(
            yoAssert.assertObjectContent.bind(
              yoAssert,
              {},
              {
                a: 'foo',
              },
            ),
          );
        });

        it('fails if nested object does not contain a key', () => {
          assert.throws(
            yoAssert.assertObjectContent.bind(
              yoAssert,
              {
                a: {},
              },
              {
                a: {b: 'foo'},
              },
            ),
          );
        });
      });

      describe('.assertNoObjectContent()', () => {
        it('fails if object contains the keys', () => {
          assert.throws(
            yoAssert.assertNoObjectContent.bind(
              yoAssert,
              {
                a: 'foo',
              },
              {
                a: 'foo',
              },
            ),
          );
        });

        it('pass if object contains nested objects and arrays', () => {
          assert.throws(
            yoAssert.assertNoObjectContent.bind(
              yoAssert,
              {
                a: {b: 'foo'},
                b: [0, 'a'],
                c: 'a',
              },
              {
                a: {b: 'foo'},
                b: [0, 'a'],
              },
            ),
          );
        });

        it('pass if array is incomplete', () => {
          assert.throws(
            yoAssert.assertNoObjectContent.bind(
              yoAssert,
              {
                b: [0, 'a'],
              },
              {
                b: [0],
              },
            ),
          );
        });

        it('pass if object does not contain a key', () => {
          assert.doesNotThrow(
            yoAssert.assertNoObjectContent.bind(
              yoAssert,
              {},
              {
                a: 'foo',
              },
            ),
          );
        });

        it('pass if nested object does not contain a key', () => {
          assert.doesNotThrow(
            yoAssert.assertNoObjectContent.bind(
              yoAssert,
              {
                a: {},
              },
              {
                a: {b: 'foo'},
              },
            ),
          );
        });
      });

      describe('.assertJsonFileContent()', () => {
        const file = path.join(__dirname, 'fixtures/assert/dummy.json');

        it('pass if file contains the keys', () => {
          assert.doesNotThrow(
            yoAssert.assertJsonFileContent.bind(yoAssert, file, {
              a: {b: 1},
              b: [1, 2],
              d: null,
            }),
          );
        });

        it('fails if file does not contain the keys', () => {
          assert.throws(
            yoAssert.assertJsonFileContent.bind(yoAssert, file, {
              a: {b: 1},
              b: 'a',
            }),
          );

          assert.throws(
            yoAssert.assertJsonFileContent.bind(yoAssert, file, {
              a: {b: 3},
              b: [1],
            }),
          );
        });

        it('fails if file does not exists', () => {
          assert.throws(
            yoAssert.assertJsonFileContent.bind(yoAssert, 'does-not-exist', {}),
          );
        });
      });

      describe('.assertNoJsonFileContent()', () => {
        const file = path.join(__dirname, 'fixtures/assert/dummy.json');

        it('.assertNoJson', () => {
          assert.throws(
            yoAssert.assertNoJsonFileContent.bind(yoAssert, file, {
              a: {b: 1},
              b: [1, 2],
            }),
          );
        });

        it('pass if file does not contain the keys', () => {
          assert.doesNotThrow(
            yoAssert.assertNoJsonFileContent.bind(yoAssert, file, {
              c: {b: 1},
              b: 'a',
            }),
          );

          assert.doesNotThrow(
            yoAssert.assertNoJsonFileContent.bind(yoAssert, file, {
              a: {b: 3},
              b: [2],
            }),
          );
        });

        it('fails if file does not exists', () => {
          assert.throws(
            yoAssert.assertNoJsonFileContent.bind(
              yoAssert,
              'does-not-exist',
              {},
            ),
          );
        });
      });
    });
  }
});
