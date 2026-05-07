import path, { dirname } from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { create as createMemFs } from 'mem-fs';
import { describe, it } from 'vitest';
import RunResult from '../src/run-result.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('run-result-assertions', () => {
  const memFs = createMemFs();

  for (const testFs of [
    {
      description: 'using memory fs',
      options: { memFs },
      verify(runResult: any) {
        assert.ok(runResult.fs);
      },
    },
    {
      description: 'using node fs',
      verify(runResult: any) {
        assert.ok(!runResult.fs);
      },
    },
  ]) {
    const yoAssert = new RunResult({
      ...testFs.options,
      cwd: path.join(__dirname, 'fixtures/assert'),
    } as any);

    describe(testFs.description, () => {
      it('fs is correct', () => {
        testFs.verify(yoAssert);
      });
      describe('.assertFile()', () => {
        it('accept a file that exists', () => {
          assert.doesNotThrow(() => yoAssert.assertFile('testFile'));
        });

        it('accept an array of files all of which exist', () => {
          assert.doesNotThrow(() => yoAssert.assertFile(['testFile', 'testFile2']));
        });

        it('reject a file that does not exist', () => {
          assert.throws(() => yoAssert.assertFile('etherealTestFile'));
        });

        it('reject multiple files one of which does not exist', () => {
          assert.throws(() => yoAssert.assertFile(['testFile', 'intangibleTestFile']));
        });
      });

      describe('.assertNoFile()', () => {
        it('accept a file that does not exist', () => {
          assert.doesNotThrow(() => yoAssert.assertNoFile('etherealTestFile'));
        });

        it('accept an array of files all of which do not exist', () => {
          assert.doesNotThrow(() => yoAssert.assertNoFile(['etherealTestFile', 'intangibleTestFile']));
        });

        it('reject a file that exists', () => {
          assert.throws(() => yoAssert.assertNoFile('testFile'));
        });

        it('reject an array of files one of which exists', () => {
          assert.throws(() => yoAssert.assertNoFile(['testFile', 'etherealTestFile']));
        });
      });

      describe('.assertFileContent()', () => {
        it('accept a file and regex when the file content matches the regex', () => {
          assert.doesNotThrow(() => yoAssert.assertFileContent('testFile', /Roses are red/));
        });

        it('accept a file and string when the file contains the string', () => {
          assert.doesNotThrow(() => yoAssert.assertFileContent('testFile', 'Roses are red'));
        });

        it('reject a file and regex when the file content does not match the regex', () => {
          assert.throws(() => yoAssert.assertFileContent('testFile', /Roses are blue/));
        });

        it('reject a file and string when the file content does not contain the string', () => {
          assert.throws(() => yoAssert.assertFileContent('testFile', 'Roses are blue'));
        });

        it("accept an array of file/regex pairs when each file's content matches the corresponding regex", () => {
          const argument: [string, RegExp][] = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are blue/],
          ];
          assert.doesNotThrow(() => yoAssert.assertFileContent(argument));
        });

        it("reject an array of file/regex pairs when one file's content does not matches the corresponding regex", () => {
          const argument: [string, RegExp][] = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are orange/],
          ];
          assert.throws(() => yoAssert.assertFileContent(argument));
        });
      });

      describe('.assertEqualsFileContent()', () => {
        it('accept a file and string when the file content equals the string', () => {
          assert.doesNotThrow(() => yoAssert.assertEqualsFileContent('testFile', 'Roses are red.\n'));
        });

        it('reject a file and string when the file content does not equal the string', () => {
          assert.throws(() => yoAssert.assertEqualsFileContent('testFile', 'Roses are red'));
        });

        it("accept an array of file/string pairs when each file's content equals the corresponding string", () => {
          const argument: [string, string][] = [
            ['testFile', 'Roses are red.\n'],
            ['testFile2', 'Violets are blue.\n'],
          ];
          assert.doesNotThrow(() => yoAssert.assertEqualsFileContent(argument));
        });

        it("reject an array of file/string pairs when one file's content does not equal the corresponding string", () => {
          const argument: [string, string][] = [
            ['testFile', 'Roses are red.\n'],
            ['testFile2', 'Violets are green.\n'],
          ];
          assert.throws(() => yoAssert.assertEqualsFileContent(argument));
        });
      });

      describe('.assertNoFileContent()', () => {
        it('accept a file and regex when the file content does not match the regex', () => {
          assert.doesNotThrow(() => yoAssert.assertNoFileContent('testFile', /Roses are blue/));
        });

        it('accept a file and string when the file content does not contain the string', () => {
          assert.doesNotThrow(() => yoAssert.assertNoFileContent('testFile', 'Roses are blue'));
        });

        it('reject a file and regex when the file content matches the regex', () => {
          assert.throws(() => yoAssert.assertNoFileContent('testFile', /Roses are red/));
        });

        it('reject a file and string when the file content contain the string', () => {
          assert.throws(() => yoAssert.assertNoFileContent('testFile', 'Roses are red'));
        });

        it("accept an array of file/regex pairs when each file's content does not match its corresponding regex", () => {
          const argument: [string, RegExp][] = [
            ['testFile', /Roses are green/],
            ['testFile2', /Violets are orange/],
          ];
          assert.doesNotThrow(() => yoAssert.assertNoFileContent(argument));
        });

        it("reject an array of file/regex pairs when one file's content does matches its corresponding regex", () => {
          const argument: [string, RegExp][] = [
            ['testFile', /Roses are red/],
            ['testFile2', /Violets are orange/],
          ];
          assert.throws(() => yoAssert.assertNoFileContent(argument));
        });
      });

      describe('.assertTextEqual()', () => {
        it('pass with two similar simple lines', () => {
          assert.doesNotThrow(() => yoAssert.assertTextEqual('I have a yellow cat', 'I have a yellow cat'));
        });

        it('fails with two different simple lines', () => {
          assert.throws(() => yoAssert.assertTextEqual('I have a yellow cat', 'I have a brown cat'));
        });

        it('pass with two similar simple lines with different new line types', () => {
          assert.doesNotThrow(() => yoAssert.assertTextEqual('I have a\nyellow cat', 'I have a\r\nyellow cat'));
        });
      });

      describe('.assertObjectContent()', () => {
        it('pass if object contains the keys', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertObjectContent(
              {
                a: 'foo',
              },
              {
                a: 'foo',
              },
            ),
          );
        });

        it('fails on missing keys', () => {
          assert.throws(() =>
            yoAssert.assertObjectContent(
              {},
              {
                a: {
                  b: 'foo',
                },
              },
            ),
          );
        });

        it('pass if object contains nested objects and arrays', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertObjectContent(
              {
                a: { b: 'foo' },
                b: [0, 'a'],
                c: 'a',
              },
              {
                a: { b: 'foo' },
                b: [0, 'a'],
              },
            ),
          );
        });

        it('pass if array is incomplete', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertObjectContent(
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
          assert.throws(() =>
            yoAssert.assertObjectContent(
              {},
              {
                a: 'foo',
              },
            ),
          );
        });

        it('fails if nested object does not contain a key', () => {
          assert.throws(() =>
            yoAssert.assertObjectContent(
              {
                a: {},
              },
              {
                a: { b: 'foo' },
              },
            ),
          );
        });
      });

      describe('.assertNoObjectContent()', () => {
        it('fails if object contains the keys', () => {
          assert.throws(() =>
            yoAssert.assertNoObjectContent(
              {
                a: 'foo',
              },
              {
                a: 'foo',
              },
            ),
          );
        });

        it('does not throw on missing keys', () => {
          yoAssert.assertNoObjectContent(
            {},
            {
              a: {
                b: 'foo',
              },
            },
          );
        });

        it('pass if object contains nested objects and arrays', () => {
          assert.throws(() =>
            yoAssert.assertNoObjectContent(
              {
                a: { b: 'foo' },
                b: [0, 'a'],
                c: 'a',
              },
              {
                a: { b: 'foo' },
                b: [0, 'a'],
              },
            ),
          );
        });

        it('pass if array is incomplete', () => {
          assert.throws(() =>
            yoAssert.assertNoObjectContent(
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
          assert.doesNotThrow(() =>
            yoAssert.assertNoObjectContent(
              {},
              {
                a: 'foo',
              },
            ),
          );
        });

        it('pass if nested object does not contain a key', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertNoObjectContent(
              {
                a: {},
              },
              {
                a: { b: 'foo' },
              },
            ),
          );
        });
      });

      describe('.assertJsonFileContent()', () => {
        const file = path.join(__dirname, 'fixtures/assert/dummy.json');

        it('pass if file contains the keys', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertJsonFileContent(file, {
              a: { b: 1 },
              b: [1, 2],
              d: null,
            }),
          );
        });

        it('fails if file does not contain the keys', () => {
          assert.throws(() =>
            yoAssert.assertJsonFileContent(file, {
              a: { b: 1 },
              b: 'a',
            }),
          );

          assert.throws(() =>
            yoAssert.assertJsonFileContent(file, {
              a: { b: 3 },
              b: [1],
            }),
          );
        });

        it('fails if file does not exists', () => {
          assert.throws(() => yoAssert.assertJsonFileContent('does-not-exist', {}));
        });
      });

      describe('.assertNoJsonFileContent()', () => {
        const file = path.join(__dirname, 'fixtures/assert/dummy.json');

        it('.assertNoJson', () => {
          assert.throws(() =>
            yoAssert.assertNoJsonFileContent(file, {
              a: { b: 1 },
              b: [1, 2],
            }),
          );
        });

        it('pass if file does not contain the keys', () => {
          assert.doesNotThrow(() =>
            yoAssert.assertNoJsonFileContent(file, {
              c: { b: 1 },
              b: 'a',
            }),
          );

          assert.doesNotThrow(() =>
            yoAssert.assertNoJsonFileContent(file, {
              a: { b: 3 },
              b: [2],
            }),
          );
        });

        it('fails if file does not exists', () => {
          assert.throws(() => yoAssert.assertNoJsonFileContent('does-not-exist', {}));
        });
      });
    });
  }
});
