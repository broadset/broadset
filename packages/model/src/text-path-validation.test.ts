import { describe, expect, it } from 'vitest';

import { broadsetDocumentSchema, createEmptyBroadsetDocument } from './document';
import { createDefaultElement } from './element';
import { hasValidTextPathReferences } from './text-path-validation';

function makePageElementInstance(elementId: string): Record<string, unknown> {
  return {
    elementId,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

function makeDocWithElements(elements: ReadonlyArray<{ readonly id: string }>): Record<string, unknown> {
  const base = createEmptyBroadsetDocument();
  const pages = base.pages.map((page, index) => ({
    ...page,
    elements: index === 0 ? elements.map((element) => makePageElementInstance(element.id)) : [...page.elements],
  }));

  return {
    id: base.id,
    name: base.name,
    documentMode: base.documentMode,
    canvas: { ...base.canvas },
    elements,
    animations: [...base.animations],
    pages,
    dataSchema: { ...base.dataSchema, fields: [...base.dataSchema.fields] },
  };
}

/**
 * Phase 1 unit #10 — the `textPathElementId` field on text elements is a
 * first-class document-level reference. Without cross-element validation
 * the field can silently drift: a stale reference, a reference to a non-
 * path target, or a self-reference would all bypass the per-element
 * schema (which only sees the field in isolation). These tests pin the
 * document-level invariants so any future change in validator plumbing
 * cannot regress the contract.
 */
describe('hasValidTextPathReferences', () => {
  /**
   * @description A document with zero text-on-path references must pass
   * validation. The helper must be a no-op for collections where the
   * field is absent or null on every element.
   */
  it('returns true for a collection with no textPathElementId references', () => {
    const items = [
      { id: 'a', type: 'text', textPathElementId: null },
      { id: 'b', type: 'rectangle', textPathElementId: null },
    ];

    expect(hasValidTextPathReferences(items)).toBe(true);
  });

  /**
   * @description The canonical happy path: a text element references an
   * existing path element. This must pass so real text-on-path usage is
   * not blocked by overly aggressive validation.
   */
  it('returns true when a text element references an existing path element', () => {
    const items = [
      { id: 'text-1', type: 'text', textPathElementId: 'path-1' },
      { id: 'path-1', type: 'path', textPathElementId: null },
    ];

    expect(hasValidTextPathReferences(items)).toBe(true);
  });

  /**
   * @description A reference to a non-existent element id must fail.
   * Stale references (e.g. a path that was deleted after the text was
   * bound) would otherwise render as "normal text" silently — the
   * validator surfaces the inconsistency instead.
   */
  it('returns false when textPathElementId references a non-existent element', () => {
    const items = [{ id: 'text-1', type: 'text', textPathElementId: 'missing' }];

    expect(hasValidTextPathReferences(items)).toBe(false);
  });

  /**
   * @description The reference target must be a `path` element.
   * Pointing at a rectangle, text, or other shape is invalid because
   * the renderer's text-on-path pipeline consumes only SVG path `d`
   * data.
   */
  it('returns false when textPathElementId references a non-path element', () => {
    const items = [
      { id: 'text-1', type: 'text', textPathElementId: 'rect-1' },
      { id: 'rect-1', type: 'rectangle', textPathElementId: null },
    ];

    expect(hasValidTextPathReferences(items)).toBe(false);
  });

  /**
   * @description Only text elements may carry textPathElementId. A
   * path, rectangle, or other element with the field set indicates
   * structural corruption — the per-element schema allows the field on
   * any type for minimum storage overhead, so the document-level
   * validator is the single place this invariant is enforced.
   */
  it('returns false when a non-text element carries textPathElementId', () => {
    const items = [
      { id: 'rect-1', type: 'rectangle', textPathElementId: 'path-1' },
      { id: 'path-1', type: 'path', textPathElementId: null },
    ];

    expect(hasValidTextPathReferences(items)).toBe(false);
  });

  /**
   * @description Self-references are rejected. A text element pointing
   * at itself cannot render along its own path (it has no path data)
   * and signals a corrupt document. The validator surfaces this rather
   * than letting it degenerate into a silent render bug.
   */
  it('returns false when a text element references itself', () => {
    const items = [{ id: 'text-1', type: 'text', textPathElementId: 'text-1' }];

    expect(hasValidTextPathReferences(items)).toBe(false);
  });

  /**
   * @description Multiple text elements may reference the same path —
   * one path shape can anchor several text flows. The validator must
   * allow fan-in.
   */
  it('returns true when multiple text elements reference the same path', () => {
    const items = [
      { id: 'text-1', type: 'text', textPathElementId: 'path-1' },
      { id: 'text-2', type: 'text', textPathElementId: 'path-1' },
      { id: 'path-1', type: 'path', textPathElementId: null },
    ];

    expect(hasValidTextPathReferences(items)).toBe(true);
  });
});

describe('broadsetDocumentSchema text-on-path validation', () => {
  /**
   * @description The document-level Zod schema must surface invalid
   * text-on-path references as issues on the `elements` path, so
   * tooling and editors can display actionable error messages rather
   * than a generic "document invalid" failure.
   */
  it('rejects a document whose text element references a non-existent path', () => {
    const text = createDefaultElement('text', { id: 'text-1', textPathElementId: 'missing' });

    const parsed = broadsetDocumentSchema.safeParse(makeDocWithElements([text]));

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);

      expect(messages.some((message) => message.includes('textPathElementId'))).toBe(true);
    }
  });

  /**
   * @description A valid text-on-path reference must not trigger any
   * validation error so the happy path remains green and existing
   * fixtures are unaffected.
   */
  it('accepts a document whose text element references an existing path', () => {
    const path = createDefaultElement('path', { id: 'path-1', content: 'M0,0 L10,10' });
    const text = createDefaultElement('text', { id: 'text-1', textPathElementId: path.id });

    const parsed = broadsetDocumentSchema.safeParse(makeDocWithElements([path, text]));

    expect(parsed.success).toBe(true);
  });
});
