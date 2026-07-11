import { describe, expect, it } from 'vitest';

import {
  createBlackColorValue,
  createDefaultAppearance,
  createDocumentV1,
  createElementGeometry,
  createElementV1,
  type CreateElementV1Input,
  createEllipseGeometry,
  createEmptyTextBody,
  createPageV1,
  createProjectV1,
  createRectangleGeometry,
  createRunProperties,
  IDENTITY_AFFINE2D,
} from './construction';
import { broadsetDocumentV1Schema } from './document';
import { type Element, elementSchema } from './element';
import { idSchema, sha256DigestSchema } from './identity';
import { parseProjectV1Unknown } from './load';
import { broadsetProjectV1Schema } from './project';
import type { Timebase } from './time';

const id = (value: string): ReturnType<typeof idSchema.parse> => idSchema.parse(value);
const geometry = createElementGeometry({ width: 120, height: 60 });

function baseOptions(name: string): { readonly id: ReturnType<typeof idSchema.parse>; readonly name: string; readonly geometry: typeof geometry } {
  return { id: id(`el-${name}`), name, geometry };
}

const elementInputs: readonly CreateElementV1Input[] = [
  { ...baseOptions('text'), kind: 'text', text: createEmptyTextBody({ paragraphId: id('p1'), runId: id('r1'), fontFamilyId: id('font'), fontFaceId: id('face') }) },
  { ...baseOptions('image'), kind: 'image', image: { assetId: id('asset'), fit: 'contain' } },
  { ...baseOptions('rect'), kind: 'vector', geometryData: createRectangleGeometry() },
  { ...baseOptions('ellipse'), kind: 'vector', geometryData: createEllipseGeometry() },
  { ...baseOptions('group'), kind: 'group' },
  { ...baseOptions('instance'), kind: 'component-instance', componentId: id('comp') },
  { ...baseOptions('video'), kind: 'video', video: { assetId: id('vid'), fit: 'cover', autoplay: false, loop: false, muted: true, controls: true } },
  { ...baseOptions('audio'), kind: 'audio', audio: { assetId: id('aud'), autoplay: false, loop: false, volume: 1 } },
  { ...baseOptions('clock'), kind: 'clock', clock: { format: 'HH:mm:ss', timeZone: 'UTC' } },
  { ...baseOptions('ticker'), kind: 'ticker', ticker: { items: [{ id: id('ti'), text: 'Headline' }], direction: 'left', speed: 60, gap: 40, repeat: true } },
  { ...baseOptions('qr'), kind: 'qrcode', qrcode: { value: 'https://broadset.dev', errorCorrection: 'M', quietZone: 4 } },
  {
    ...baseOptions('foreign'),
    kind: 'foreign',
    foreign: {
      mediaType: 'application/vnd.ms-powerpoint',
      sourceBlob: { digest: sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`), byteLength: 1024, mediaType: 'application/vnd.ms-powerpoint', source: { kind: 'package', path: `blobs/sha256/${'a'.repeat(64)}` } },
      previewAssetId: id('preview'),
      safeRenderMode: 'preview-only',
      reason: 'unsupported source content',
    },
  },
  { ...baseOptions('plugin'), kind: 'plugin', plugin: { pluginId: 'com.example.widget', elementType: 'gauge', schemaVersion: 1, payload: { value: 42 } } },
];

describe('v1 construction factories', () => {
  it('builds a schema-valid, semantically loadable minimal project', () => {
    const project = createProjectV1();

    expect(() => broadsetProjectV1Schema.parse(project)).not.toThrow();

    const result = parseProjectV1Unknown(project);

    expect(result.status).toBe('loaded');
  });

  it('builds a schema-valid empty static document', () => {
    const document = createDocumentV1({ id: id('doc-1'), name: 'Doc' });

    expect(() => broadsetDocumentV1Schema.parse(document)).not.toThrow();
    expect(document.kind).toBe('static');
    expect(document.timebase).toBeUndefined();
  });

  it('builds structurally valid elements for every kind', () => {
    for (const input of elementInputs) {
      const element = createElementV1(input);

      expect(element.kind).toBe(input.kind);
      expect(() => elementSchema.parse(element)).not.toThrow();
    }
  });

  it('applies base defaults (identity transform, opaque appearance, unlocked)', () => {
    const element = createElementV1({ ...baseOptions('defaults'), kind: 'vector', geometryData: createRectangleGeometry() });

    expect(element.parentId).toBeNull();
    expect(element.locked).toBe(false);
    expect(element.hiddenInEditor).toBe(false);
    expect(element.geometry.transform).toEqual(IDENTITY_AFFINE2D);
    expect(element.appearance).toEqual(createDefaultAppearance());
    expect(element.sharedStyleIds).toEqual([]);
  });

  it('places a factory element on a page and loads without quarantine', () => {
    const rectangle: Element = createElementV1({ ...baseOptions('placed'), kind: 'vector', geometryData: createRectangleGeometry() });
    const document = createDocumentV1({
      id: id('doc-2'),
      name: 'Placed',
      elements: [rectangle],
      pages: [
        {
          id: id('page-1'),
          name: 'Page 1',
          rootInstances: [{ id: id('root-1'), elementId: rectangle.id, overrides: [], componentPropertyValues: [] }],
          descendantOverrides: [],
          selectedVariableModes: {},
          selectedSampleDataSets: {},
          extensions: [],
        },
      ],
    });
    const project = createProjectV1({ id: id('proj-2'), documents: [document] });

    const result = parseProjectV1Unknown(project);

    expect(result.status).toBe('loaded');
  });

  it('builds a schema-valid, loadable motion document with a required timebase', () => {
    const timebase: Timebase = {
      frameRate: { numerator: 30, denominator: 1 },
      ticksPerSecond: 30,
      timecode: { nominalFramesPerSecond: 30, dropFrame: false },
    };
    const document = createDocumentV1({ id: id('motion-doc'), kind: 'motion', timebase });

    expect(() => broadsetDocumentV1Schema.parse(document)).not.toThrow();
    expect(document.kind).toBe('motion');
    expect(document.timebase).toEqual(timebase);

    const result = parseProjectV1Unknown(createProjectV1({ id: id('motion-proj'), documents: [document] }));

    expect(result.status).toBe('loaded');
  });

  it('treats an empty pages/documents array like an omitted one (schema requires at least one)', () => {
    const document = createDocumentV1({ id: id('doc-empty-pages'), pages: [] });

    expect(document.pages).toHaveLength(1);
    expect(() => broadsetDocumentV1Schema.parse(document)).not.toThrow();

    const project = createProjectV1({ id: id('proj-empty-docs'), documents: [] });

    expect(project.documents).toHaveLength(1);
    expect(parseProjectV1Unknown(project).status).toBe('loaded');
  });

  it('builds an empty page and default run typography', () => {
    const page = createPageV1({ id: id('page-x') });

    expect(page.rootInstances).toEqual([]);
    expect(page.name).toBe('Page 1');

    const run = createRunProperties({ fontFamilyId: id('f'), fontFaceId: id('face') });

    expect(run.size).toBeGreaterThan(0);
    expect(run.weight).toBeGreaterThan(0);
    expect(run.color).toEqual(createBlackColorValue());
  });

  it('returns fresh appearances and freezes shared default constants against mutation', () => {
    expect(createDefaultAppearance()).not.toBe(createDefaultAppearance());
    expect(createDefaultAppearance().fills).not.toBe(createDefaultAppearance().fills);
    expect(createBlackColorValue()).toEqual({ kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 });
    expect(Object.isFrozen(IDENTITY_AFFINE2D)).toBe(true);
    expect(Object.isFrozen(IDENTITY_AFFINE2D.matrix)).toBe(true);
  });
});
