import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { broadsetProjectV1Schema, validateBroadsetProjectV1Semantics } from './index';

const CHAIN_LENGTH = 5_000;

function variableAlias(index: number, cyclic: boolean) {
  if (index < CHAIN_LENGTH - 1)
    return { aliasOf: { collectionId: 'collection', variableId: `variable-${String(index + 1)}` } };
  if (cyclic) return { aliasOf: { collectionId: 'collection', variableId: 'variable-0' } };

  return {};
}

function styleSource(index: number, cyclic: boolean) {
  if (index < CHAIN_LENGTH - 1) return { kind: 'alias' as const, styleId: `style-${String(index + 1)}` };
  if (cyclic) return { kind: 'alias' as const, styleId: 'style-0' };

  return {
    kind: 'properties' as const,
    entries: [{ id: 'family', pointer: '/fontFamilyId', value: { type: 'string' as const, value: 'font' } }],
  };
}

function variableProject(cyclic: boolean) {
  const project = createMinimalProjectV1();
  const variables = Array.from({ length: CHAIN_LENGTH }, (_, index) => ({
    id: `variable-${String(index)}`,
    name: `Variable ${String(index)}`,
    valueType: 'string' as const,
    valuesByMode: { default: { type: 'string' as const, value: 'value' } },
    ...variableAlias(index, cyclic),
  }));

  return broadsetProjectV1Schema.parse({
    ...project,
    resources: {
      ...project.resources,
      variables: [{ id: 'collection', name: 'Collection', modes: [{ id: 'default', name: 'Default' }], defaultModeId: 'default', variables }],
    },
  });
}

function textStyleProject(cyclic: boolean) {
  const project = createMinimalProjectV1();
  const styles = Array.from({ length: CHAIN_LENGTH }, (_, index) => ({
    id: `style-${String(index)}`,
    name: `Style ${String(index)}`,
    kind: 'text' as const,
    source: styleSource(index, cyclic),
  }));

  return broadsetProjectV1Schema.parse({
    ...project,
    resources: {
      ...project.resources,
      fonts: [{ id: 'font', familyName: 'Example', fallbackFontIds: [], faces: [] }],
      styles,
    },
  });
}

describe('indexed alias validation complexity', () => {
  it('validates a 5,000-variable alias chain and detects a cycle without repeated chain walks', () => {
    expect(validateBroadsetProjectV1Semantics(variableProject(false)).some(({ code }) => code.includes('alias'))).toBe(false);
    expect(validateBroadsetProjectV1Semantics(variableProject(true)).some(({ code }) => code === 'variable.alias-cycle')).toBe(true);
  });

  it('resolves a 5,000-text-style font inheritance chain and detects a cycle iteratively', () => {
    expect(validateBroadsetProjectV1Semantics(textStyleProject(false)).some(({ code }) => code === 'style.cycle')).toBe(false);
    expect(validateBroadsetProjectV1Semantics(textStyleProject(true)).some(({ code }) => code === 'style.cycle')).toBe(true);
  });
});
