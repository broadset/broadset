import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptx } from './import';

/**
 * @description Per-page `content`, `style`, and `assetId` overrides on
 * `PageElementInstance` round-trip end-to-end through the PPTX
 * exporter and importer via the `customXml/broadset-project.xml`
 * fast-path. Closes pptx-known-gaps §A2.
 */
describe('PPTX page-element-instance overrides round-trip', () => {
  it('round-trips content + style + assetId overrides via the project custom XML', () => {
    const base = createEmptyBroadsetDocument();
    const element = createDefaultElement('text', { id: 'shared-text', content: 'base copy' });
    const firstPage = base.pages[0];

    if (firstPage === undefined) throw new Error('base document missing default page');

    const doc = {
      ...base,
      elements: [element],
      pages: [
        {
          ...firstPage,
          elements: [
            {
              elementId: 'shared-text',
              transform: {
                position: { x: 10, y: 20, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
              content: 'page-1 specific copy',
              style: { fontSize: 32, opacity: 0.6 },
              assetId: 'asset-page-1-image',
            },
          ],
        },
      ],
    };

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);
    const importedInstance = imported.pages[0]?.elements[0];

    expect(importedInstance?.elementId).toBe('shared-text');
    expect(importedInstance?.content).toBe('page-1 specific copy');
    expect(importedInstance?.style).toMatchObject({ fontSize: 32, opacity: 0.6 });
    expect(importedInstance?.assetId).toBe('asset-page-1-image');
  });

  it('merges a partial style override on top of element style without dropping element-only style fields', () => {
    const base = createEmptyBroadsetDocument();
    // Element style declares fontFamily; override only sets opacity. After
    // export the merged slide-time element MUST keep fontFamily AND apply
    // the new opacity — partial overrides are merges, not replacements.
    const element = createDefaultElement('text', {
      id: 'styled-text',
      content: 'merged style sample',
      style: { fontFamily: 'Inter', fontSize: 16, opacity: 1 },
    });
    const firstPage = base.pages[0];

    if (firstPage === undefined) throw new Error('base document missing default page');

    const doc = {
      ...base,
      elements: [element],
      pages: [
        {
          ...firstPage,
          elements: [
            {
              elementId: 'styled-text',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
              style: { opacity: 0.4 },
            },
          ],
        },
      ],
    };

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);
    const importedInstance = imported.pages[0]?.elements[0];

    expect(importedInstance?.style).toMatchObject({ opacity: 0.4 });

    // Element-level fontFamily / fontSize survive the merge — they were
    // not in the override, so they fall through.
    const importedElement = imported.elements.find((el) => el.id === 'styled-text');

    expect(importedElement?.style.fontFamily).toBe('Inter');
    expect(importedElement?.style.fontSize).toBe(16);
  });

  it('preserves baseline (no-override) instances unchanged through round-trip', () => {
    const base = createEmptyBroadsetDocument();
    const element = createDefaultElement('rectangle', { id: 'rect-1' });
    const firstPage = base.pages[0];

    if (firstPage === undefined) throw new Error('base document missing default page');

    const doc = {
      ...base,
      elements: [element],
      pages: [
        {
          ...firstPage,
          elements: [
            {
              elementId: 'rect-1',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
            },
          ],
        },
      ],
    };

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);
    const importedInstance = imported.pages[0]?.elements[0];

    expect(importedInstance?.elementId).toBe('rect-1');
    expect(importedInstance?.content).toBeUndefined();
    expect(importedInstance?.style).toBeUndefined();
    expect(importedInstance?.assetId).toBeUndefined();
  });
});
