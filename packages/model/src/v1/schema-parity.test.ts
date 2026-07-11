/// <reference types="node" />

import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parityCorpus } from './fixtures/schema-parity-corpus';
import {
  STRUCTURAL_COVERAGE_MATRIX,
} from './fixtures/schema-parity-coverage';
import {
  EXPECTED_DISCRIMINATED_UNION_VARIANTS,
  schemaParityWitnessRegistry,
} from './fixtures/schema-parity-witnesses';
import { broadsetProjectV1Schema } from './project';

function readPublishedSchema(): Record<string, unknown> {
  const schemaText = readFileSync(
    new URL('../../../../project/schema/v1/project.schema.json', import.meta.url),
    'utf8',
  );

  return z.record(z.string(), z.unknown()).parse(JSON.parse(schemaText) as unknown);
}

function resolvePointer(input: unknown, pointer: string): unknown {
  return pointer
    .split('/')
    .slice(1)
    .reduce<unknown>((value, segment) => {
      if (typeof value !== 'object' || value === null) return undefined;

      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');

      return Object.getOwnPropertyDescriptor(value, key)?.value;
    }, input);
}

describe('v1 JSON Schema parity', () => {
  it('matches Zod acceptance across every structural constraint-family case', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });

    addFormats(ajv);

    const validateJsonSchema = ajv.compile(readPublishedSchema());

    expect(new Set(parityCorpus.map(({ task }) => task))).toEqual(new Set([2, 3, 4, 5, 6]));

    const caseNames = new Set(parityCorpus.map(({ name }) => name));

    Object.values(STRUCTURAL_COVERAGE_MATRIX).flat().forEach((name) => {
      expect(caseNames, `Coverage matrix references missing case: ${name}`).toContain(name);
    });
    parityCorpus.forEach(({ expected, input, name }) => {
      const zodAccepted = broadsetProjectV1Schema.safeParse(input).success;
      const jsonSchemaAccepted = validateJsonSchema(input);

      expect(zodAccepted, `${name}: unexpected Zod outcome`).toBe(expected);
      expect(jsonSchemaAccepted, `${name}: Zod and JSON Schema diverged`).toBe(zodAccepted);
    });
  });

  it('accepts a path-bound project witness for every variant of every discriminated union', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });

    addFormats(ajv);

    const validateJsonSchema = ajv.compile(readPublishedSchema());
    const actualInventory = Object.fromEntries(
      schemaParityWitnessRegistry.map(({ family, variants }) => [
        family,
        variants.map(({ discriminant }) => discriminant),
      ]),
    );

    expect(schemaParityWitnessRegistry).toHaveLength(35);
    expect(actualInventory).toEqual(EXPECTED_DISCRIMINATED_UNION_VARIANTS);

    schemaParityWitnessRegistry.forEach(({ family, path, discriminator, variants }) => {
      variants.forEach(({ discriminant, project }) => {
        const witness = project();
        const label = `${family}.${discriminant} at ${path}`;
        const resolved = resolvePointer(witness, path);
        const zodResult = broadsetProjectV1Schema.safeParse(witness);
        const ajvAccepted = validateJsonSchema(witness);

        expect(resolvePointer(resolved, `/${discriminator}`), `${label}: witness path is incorrect`).toBe(discriminant);
        expect(
          zodResult.success,
          `${label}: Zod rejected the witness: ${zodResult.success ? '' : z.prettifyError(zodResult.error)}`,
        ).toBe(true);
        expect(ajvAccepted, `${label}: JSON Schema rejected the witness: ${JSON.stringify(validateJsonSchema.errors)}`).toBe(
          true,
        );
      });
    });
  });
});
