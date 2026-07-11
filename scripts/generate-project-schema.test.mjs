import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

test('deterministically generates the checked v1 project schema', async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'broadset-schema-'));
  const outputPath = path.join(temporaryDirectory, 'project.schema.json');

  await execFileAsync(process.execPath, ['scripts/generate-project-schema.mjs', '--output', outputPath], { cwd: root });

  const [generatedText, checkedText] = await Promise.all([
    readFile(outputPath, 'utf8'),
    readFile(path.join(root, 'project/schema/v1/project.schema.json'), 'utf8'),
  ]);

  assert.equal(generatedText.endsWith('\n'), true);
  assert.equal(generatedText.endsWith('\n\n'), false);
  assert.deepEqual(JSON.parse(generatedText), JSON.parse(checkedText));
});
