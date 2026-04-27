import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importPptx } from './import';

/**
 * @description python-pptx oracle fixture gate. This optional dev-only
 * suite generates a canonical PPTX with python-pptx, imports the bytes
 * with Broadset, and checks geometry / text / fill expectations sourced
 * from the generator inputs. It catches our ECMA-376 misreads against a
 * known-good OOXML writer without committing generated fixture bytes.
 */

const REQUIRE_PYTHON_PPTX = process.env['BROADSET_REQUIRE_PYTHON_PPTX'] === '1';
const GENERATOR_PATH = resolve(process.cwd(), 'scripts/generate-python-pptx-oracle.py');
const FIXTURE_BASENAME = 'python-pptx-oracle';
const COORDINATE_PRECISION = 1;

interface OraclePoint {
  readonly x: number;
  readonly y: number;
}

interface OracleSize {
  readonly width: number;
  readonly height: number;
}

interface OracleElementExpectation {
  readonly type: 'text' | 'rectangle' | 'ellipse';
  readonly name: string;
  readonly position: OraclePoint;
  readonly size: OracleSize;
  readonly textContains?: string;
  readonly fillHex?: `#${string}`;
}

interface OracleExpected {
  readonly schemaVersion: 1;
  readonly generator: 'python-pptx';
  readonly slideCount: number;
  readonly canvas: OracleSize & { readonly unit: 'mm' };
  readonly elements: readonly OracleElementExpectation[];
}

function findPython(): string | null {
  for (const cmd of ['python3', 'python']) {
    const result = spawnSync(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });

    if (result.status === 0) return cmd;
  }

  return null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPoint(value: unknown): value is OraclePoint {
  if (!isRecord(value)) return false;

  return typeof value['x'] === 'number' && typeof value['y'] === 'number';
}

function isSize(value: unknown): value is OracleSize {
  if (!isRecord(value)) return false;

  return typeof value['width'] === 'number' && typeof value['height'] === 'number';
}

function isOracleElement(value: unknown): value is OracleElementExpectation {
  if (!isRecord(value)) return false;

  const type = value['type'];

  return (
    (type === 'text' || type === 'rectangle' || type === 'ellipse') &&
    typeof value['name'] === 'string' &&
    isPoint(value['position']) &&
    isSize(value['size']) &&
    (value['textContains'] === undefined || typeof value['textContains'] === 'string') &&
    (value['fillHex'] === undefined || (typeof value['fillHex'] === 'string' && value['fillHex'].startsWith('#')))
  );
}

function parseOracleExpected(path: string): OracleExpected {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

  if (!isRecord(parsed)) throw new Error('oracle expected file must contain an object');
  if (parsed['schemaVersion'] !== 1) throw new Error('unsupported oracle schema version');
  if (parsed['generator'] !== 'python-pptx') throw new Error('oracle generator must be python-pptx');
  if (typeof parsed['slideCount'] !== 'number') throw new Error('oracle slideCount must be numeric');

  const canvas = parsed['canvas'];

  if (!isRecord(canvas) || canvas['unit'] !== 'mm' || !isSize(canvas)) {
    throw new Error('oracle canvas must declare mm width and height');
  }

  const elements = parsed['elements'];

  if (!Array.isArray(elements) || !elements.every(isOracleElement)) {
    throw new Error('oracle elements must be valid element expectations');
  }

  return {
    schemaVersion: 1,
    generator: 'python-pptx',
    slideCount: parsed['slideCount'],
    canvas: { unit: 'mm', width: canvas.width, height: canvas.height },
    elements,
  };
}

function elementTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!isRecord(content) || !Array.isArray(content['paragraphs'])) return '';

  return content['paragraphs']
    .filter(isRecord)
    .flatMap((paragraph) => {
      const runs = paragraph['runs'];

      if (!Array.isArray(runs)) return [];

      return runs.filter(isRecord).map((run) => (typeof run['text'] === 'string' ? run['text'] : ''));
    })
    .join('');
}

const python = findPython();

describe('python-pptx oracle fixture generator', () => {
  if (!REQUIRE_PYTHON_PPTX) {
    it.skip('set BROADSET_REQUIRE_PYTHON_PPTX=1 to generate and verify the python-pptx oracle fixture', () => {
      expect(GENERATOR_PATH).toContain('generate-python-pptx-oracle.py');
    });

    return;
  }

  if (python === null) {
    it('requires python3 or python on PATH', () => {
      expect.fail('python3 or python is required when BROADSET_REQUIRE_PYTHON_PPTX=1');
    });

    return;
  }

  it(`imports the generated ${FIXTURE_BASENAME} fixture with expected geometry and styles`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'broadset-python-pptx-'));
    const result = spawnSync(python, [GENERATOR_PATH, '--out-dir', dir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });

    expect(result.status, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);

    const expected = parseOracleExpected(join(dir, `${FIXTURE_BASENAME}.expected.json`));
    const bytes = new Uint8Array(readFileSync(join(dir, `${FIXTURE_BASENAME}.pptx`)));
    const doc = importPptx(bytes);

    expect(doc.pages).toHaveLength(expected.slideCount);
    expect(doc.canvas.unit).toBe(expected.canvas.unit);
    expect(doc.canvas.width).toBeCloseTo(expected.canvas.width, COORDINATE_PRECISION);
    expect(doc.canvas.height).toBeCloseTo(expected.canvas.height, COORDINATE_PRECISION);

    for (const expectedElement of expected.elements) {
      const element = doc.elements.find((candidate) => candidate.type === expectedElement.type && candidate.name === expectedElement.name);

      expect(element, `missing ${expectedElement.type} named ${expectedElement.name}`).toBeDefined();
      if (element === undefined) continue;

      expect(element.position.x).toBeCloseTo(expectedElement.position.x, COORDINATE_PRECISION);
      expect(element.position.y).toBeCloseTo(expectedElement.position.y, COORDINATE_PRECISION);
      expect(element.width).toBeCloseTo(expectedElement.size.width, COORDINATE_PRECISION);
      expect(element.height).toBeCloseTo(expectedElement.size.height, COORDINATE_PRECISION);

      if (expectedElement.textContains !== undefined) {
        expect(elementTextContent(element.content)).toContain(expectedElement.textContains);
      }

      if (expectedElement.fillHex !== undefined) {
        const fill = element.style.fill;

        if (fill.kind !== 'solid' || fill.color.kind !== 'rgb') {
          throw new Error(`expected ${element.id} to have a solid RGB fill`);
        }

        expect(fill.color.hex.toUpperCase()).toBe(expectedElement.fillHex);
      }
    }
  });
});