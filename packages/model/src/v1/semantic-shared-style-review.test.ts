import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1, validateBroadsetProjectV1Semantics } from './index';
import { parseReviewProject } from './semantic-review-fixtures';

const color = {
  type: 'color',
  value: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 },
} as const;

const textEntries = [
  ['/fontFamilyId', { type: 'string', value: 'family' }],
  ['/fontFaceId', { type: 'string', value: 'regular' }],
  ['/size', { type: 'length', value: 12 }],
  ['/color', color],
  ['/weight', { type: 'integer', value: 400 }],
  ['/language', { type: 'string', value: 'fi-FI' }],
  ['/script', { type: 'string', value: 'Latn' }],
  ['/direction', { type: 'string', value: 'ltr' }],
  ['/baselineShift', { type: 'length', value: 0 }],
  ['/tracking', { type: 'number', value: 0 }],
  ['/hyperlink', { type: 'string', value: 'https://example.com' }],
  ['/semanticRole', { type: 'string', value: 'strong' }],
  ['/decoration/underline', { type: 'boolean', value: true }],
  ['/decoration/strikeThrough', { type: 'boolean', value: false }],
  ['/decoration/style', { type: 'string', value: 'solid' }],
  ['/decoration/color', color],
  ['/paragraph/alignment', { type: 'string', value: 'start' }],
  ['/paragraph/direction', { type: 'string', value: 'ltr' }],
  ['/paragraph/spaceBefore', { type: 'length', value: 0 }],
  ['/paragraph/spaceAfter', { type: 'length', value: 0 }],
  ['/paragraph/firstLineIndent', { type: 'length', value: 0 }],
  ['/paragraph/startIndent', { type: 'length', value: 0 }],
  ['/paragraph/endIndent', { type: 'length', value: 0 }],
  ['/paragraph/hyphenation', { type: 'string', value: 'none' }],
  ['/paragraph/keepTogether', { type: 'boolean', value: false }],
  ['/paragraph/keepWithNext', { type: 'boolean', value: false }],
  ['/paragraph/widowControl', { type: 'boolean', value: true }],
] as const;

function createStyleProject(entries: readonly (readonly [string, unknown])[]): ReturnType<typeof parseReviewProject> {
  const project = createMinimalProjectV1();
  const style = {
    id: 'style',
    name: 'Style',
    kind: 'text',
    source: {
      kind: 'properties',
      entries: entries.map(([pointer, value], index) => ({ id: `entry-${String(index)}`, pointer, value })),
    },
  };

  return parseReviewProject({ ...project, resources: { ...project.resources, styles: [style] } });
}

describe('complete shared-style pointer matrices', () => {
  it('accepts every representable text-run, decoration, and paragraph scalar leaf', () => {
    const diagnostics = validateBroadsetProjectV1Semantics(createStyleProject(textEntries));

    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'style.invalid-pointer' }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'style.incompatible-value' }));
  });

  it.each([
    ['multiple line spacing', [
      ['/paragraph/lineSpacing/kind', { type: 'string', value: 'multiple' }],
      ['/paragraph/lineSpacing/value', { type: 'number', value: 1.2 }],
    ]],
    ['absolute line spacing', [
      ['/paragraph/lineSpacing/kind', { type: 'string', value: 'absolute' }],
      ['/paragraph/lineSpacing/value', { type: 'length', value: 14 }],
    ]],
    ['ordered list', [
      ['/paragraph/list/kind', { type: 'string', value: 'ordered' }],
      ['/paragraph/list/level', { type: 'integer', value: 1 }],
      ['/paragraph/list/startAt', { type: 'integer', value: 1 }],
      ['/paragraph/list/style', { type: 'string', value: 'decimal' }],
    ]],
    ['unordered list', [
      ['/paragraph/list/kind', { type: 'string', value: 'unordered' }],
      ['/paragraph/list/level', { type: 'integer', value: 1 }],
      ['/paragraph/list/marker', { type: 'string', value: 'disc' }],
    ]],
    ['no list', [['/paragraph/list/kind', { type: 'string', value: 'none' }]]],
  ] as const)('accepts conditional %s leaves', (_name, entries) => {
    const diagnostics = validateBroadsetProjectV1Semantics(createStyleProject(entries));

    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'style.invalid-pointer' }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'style.incompatible-value' }));
  });

  it.each([
    ['normal line spacing value', [
      ['/paragraph/lineSpacing/kind', { type: 'string', value: 'normal' }],
      ['/paragraph/lineSpacing/value', { type: 'number', value: 1 }],
    ], 1],
    ['ordered list marker', [
      ['/paragraph/list/kind', { type: 'string', value: 'ordered' }],
      ['/paragraph/list/marker', { type: 'string', value: 'disc' }],
    ], 1],
    ['unordered list start', [
      ['/paragraph/list/kind', { type: 'string', value: 'unordered' }],
      ['/paragraph/list/startAt', { type: 'integer', value: 1 }],
    ], 1],
  ] as const)('rejects %s when the property does not exist on the selected variant', (_name, entries, index) => {
    expect(validateBroadsetProjectV1Semantics(createStyleProject(entries))).toContainEqual(
      expect.objectContaining({ code: 'style.invalid-pointer', pointer: `/resources/styles/0/source/entries/${String(index)}/pointer` }),
    );
  });

  it.each([
    ['/paragraph/lineSpacing/kind', 'custom'],
    ['/paragraph/list/kind', 'bullets'],
  ] as const)('rejects unknown enum value %s=%s', (pointer, value) => {
    expect(validateBroadsetProjectV1Semantics(createStyleProject([[pointer, { type: 'string', value }]]))).toContainEqual(
      expect.objectContaining({ code: 'style.incompatible-value', pointer: '/resources/styles/0/source/entries/0/value' }),
    );
  });

  it('rejects a missing font family referenced by a text style', () => {
    expect(validateBroadsetProjectV1Semantics(createStyleProject([
      ['/fontFamilyId', { type: 'string', value: 'missing-family' }],
    ]))).toContainEqual(
      expect.objectContaining({
        code: 'resource.missing-reference',
        pointer: '/resources/styles/0/source/entries/0/value/value',
      }),
    );
  });

  it('rejects a missing face in the referenced font family', () => {
    const project = createMinimalProjectV1();
    const font = {
      id: 'family',
      familyName: 'Family',
      fallbackFontIds: [],
      faces: [{
        id: 'regular',
        source: { kind: 'system', postScriptName: 'Family-Regular' },
        weight: 400,
        style: 'normal',
        stretch: 100,
      }],
    };
    const style = {
      id: 'style',
      name: 'Style',
      kind: 'text',
      source: {
        kind: 'properties',
        entries: [
          { id: 'family', pointer: '/fontFamilyId', value: { type: 'string', value: 'family' } },
          { id: 'face', pointer: '/fontFaceId', value: { type: 'string', value: 'missing-face' } },
        ],
      },
    };
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, fonts: [font], styles: [style] },
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({
        code: 'resource.missing-reference',
        pointer: '/resources/styles/0/source/entries/1/value/value',
      }),
    );
  });

  it('resolves a font face against an inherited font family', () => {
    const project = createMinimalProjectV1();
    const font = {
      id: 'family', familyName: 'Family', fallbackFontIds: [],
      faces: [{ id: 'regular', source: { kind: 'system', postScriptName: 'Family-Regular' }, weight: 400, style: 'normal', stretch: 100 }],
    };
    const styles = [
      {
        id: 'base', name: 'Base', kind: 'text',
        source: { kind: 'properties', entries: [{ id: 'family', pointer: '/fontFamilyId', value: { type: 'string', value: 'family' } }] },
      },
      {
        id: 'derived', name: 'Derived', kind: 'text',
        source: {
          kind: 'properties', inheritedStyleId: 'base',
          entries: [{ id: 'face', pointer: '/fontFaceId', value: { type: 'string', value: 'regular' } }],
        },
      },
    ];
    const actual = parseReviewProject({ ...project, resources: { ...project.resources, fonts: [font], styles } });

    expect(validateBroadsetProjectV1Semantics(actual)).not.toContainEqual(
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/resources/styles/1/source/entries/0/value/value' }),
    );
  });

  it('rejects a standalone font face without an effective family', () => {
    expect(validateBroadsetProjectV1Semantics(createStyleProject([
      ['/fontFaceId', { type: 'string', value: 'regular' }],
    ]))).toContainEqual(
      expect.objectContaining({
        code: 'resource.missing-reference',
        pointer: '/resources/styles/0/source/entries/0/value/value',
      }),
    );
  });
});
