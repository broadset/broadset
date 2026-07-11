/// <reference types="node" />

import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { broadsetProjectV1Schema } from './project';

interface ParityCase {
  readonly name: string;
  readonly task: 2 | 3 | 4 | 5 | 6;
  readonly expected: boolean;
  readonly input: unknown;
}

const baseProject = createMinimalProjectV1();
const baseDocument = baseProject.documents[0];

if (baseDocument === undefined) throw new Error('Minimal project must contain a document');

const appearance = { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] } as const;
const geometry = {
  bounds: { width: 100, height: 50 },
  transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
  origin: [0.5, 0.5, 0],
} as const;
const vectorElement = {
  id: 'shape',
  name: 'Shape',
  parentId: null,
  locked: false,
  hiddenInEditor: false,
  geometry,
  appearance,
  sharedStyleIds: [],
  extensions: [],
  kind: 'vector',
  geometryData: { kind: 'rectangle', cornerRadii: [0, 0, 0, 0] },
} as const;
const viewModel = {
  id: 'news',
  name: 'News',
  fields: [
    {
      id: 'headline',
      name: 'Headline',
      schema: { kind: 'string' },
      defaultValue: { type: 'string', value: 'Latest' },
      stalePolicy: 'use-default',
    },
  ],
  sampleDataSets: [{ id: 'sample', name: 'Sample', values: { headline: { type: 'string', value: 'Bulletin' } } }],
} as const;
const sequence = {
  id: 'sequence',
  name: 'Sequence',
  durationTicks: 10,
  loop: { kind: 'none' },
  tracks: [],
  markers: [],
  cues: [],
  childClips: [],
} as const;

const parityCorpus: readonly ParityCase[] = [
  {
    name: 'Task 2 accepts versioned extension JSON',
    task: 2,
    expected: true,
    input: {
      ...baseProject,
      extensions: [
        {
          namespace: 'com.example.parity',
          schema: 'https://example.com/parity.schema.json',
          version: 1,
          payload: { enabled: true },
        },
      ],
    },
  },
  {
    name: 'Task 2 rejects unknown metadata fields',
    task: 2,
    expected: false,
    input: { ...baseProject, metadata: { ...baseProject.metadata, extra: true } },
  },
  {
    name: 'Task 3 accepts a closed vector element',
    task: 3,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, elements: [vectorElement] }] },
  },
  {
    name: 'Task 3 rejects unknown surface fields',
    task: 3,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, surface: { ...baseDocument.surface, extra: true } }] },
  },
  {
    name: 'Task 4 accepts a closed view model',
    task: 4,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, viewModels: [viewModel] }] },
  },
  {
    name: 'Task 4 rejects unknown page fields',
    task: 4,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, pages: [{ ...baseDocument.pages[0], extra: true }] }] },
  },
  {
    name: 'Task 5 accepts a closed sequence',
    task: 5,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, sequences: [sequence] }] },
  },
  {
    name: 'Task 5 rejects an incomplete sequence',
    task: 5,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, sequences: [{ id: 'incomplete' }] }] },
  },
  {
    name: 'Task 6 accepts aggregate template groups',
    task: 6,
    expected: true,
    input: {
      ...baseProject,
      templateGroups: [
        {
          id: 'group',
          name: 'Group',
          members: [
            {
              id: 'member',
              documentId: baseDocument.id,
              role: { kind: 'named', name: 'Primary' },
              outputProfileIds: [],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Task 6 rejects unknown aggregate fields',
    task: 6,
    expected: false,
    input: { ...baseProject, interop: { ...baseProject.interop, extra: true } },
  },
];

describe('v1 JSON Schema parity', () => {
  it('matches Zod acceptance across every Task 2-6 structural corpus case', () => {
    const schemaText = readFileSync(
      new URL('../../../../project/schema/v1/project.schema.json', import.meta.url),
      'utf8',
    );
    const schema = z.record(z.string(), z.unknown()).parse(JSON.parse(schemaText) as unknown);
    const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { 'date-time': true, uri: true } });
    const validateJsonSchema = ajv.compile(schema);

    expect(new Set(parityCorpus.map(({ task }) => task))).toEqual(new Set([2, 3, 4, 5, 6]));
    parityCorpus.forEach(({ expected, input, name }) => {
      const zodAccepted = broadsetProjectV1Schema.safeParse(input).success;
      const jsonSchemaAccepted = validateJsonSchema(input);

      expect(zodAccepted, `${name}: unexpected Zod outcome`).toBe(expected);
      expect(jsonSchemaAccepted, `${name}: Zod and JSON Schema diverged`).toBe(zodAccepted);
    });
  });
});
