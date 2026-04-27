import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { buildProjectCustomXml, parseProjectCustomXml } from './custom-xml';

/**
 * @description Custom XML parts under `customXml/` are the document-level
 * durable carrier for Broadset state PPTX cannot express visually. The
 * build → parse round-trip must preserve every document field except
 * animations (dropped per IO-D-16).
 */
describe('buildProjectCustomXml / parseProjectCustomXml', () => {
  it('round-trips an empty document', () => {
    const doc = createEmptyBroadsetDocument();
    const xml = buildProjectCustomXml(doc);
    const parsed = parseProjectCustomXml(xml);

    expect(parsed).toMatchObject({ id: doc.id, name: doc.name });
  });

  it('round-trips a document with elements + pages', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'el-1' })],
    };
    const xml = buildProjectCustomXml(doc);
    const parsed = parseProjectCustomXml(xml) as { readonly elements?: readonly { readonly id?: string }[] };

    expect(parsed.elements).toBeDefined();
    expect(parsed.elements?.[0]?.id).toBe('el-1');
  });

  it('strips animations (IO-D-16 — PPTX never carries animation data in customXml)', () => {
    // Inject via a structural assignment that respects the AnimationDefinition
    // shape (elementId + config) without needing the full schema.
    const base = createEmptyBroadsetDocument();
    const doc: typeof base = {
      ...base,
      animations: [
        {
          elementId: 'el-1',
          config: {
            timelines: [],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    };
    const xml = buildProjectCustomXml(doc);
    const parsed = parseProjectCustomXml(xml) as { readonly animations?: readonly unknown[] };

    expect(parsed.animations).toEqual([]);
  });

  it('survives payloads with XML-special characters via base64 encoding', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      name: 'has ]]> & <angle> "quotes"',
    };
    const xml = buildProjectCustomXml(doc);
    const parsed = parseProjectCustomXml(xml) as { readonly name?: string };

    expect(parsed.name).toBe('has ]]> & <angle> "quotes"');
    // No XML-special characters from the payload leak into the wire form.
    expect(xml).not.toContain(']]>');
    expect(xml).toContain('encoding="base64"');
  });

  it('returns null for non-project inputs', () => {
    expect(parseProjectCustomXml('')).toBeNull();
    expect(parseProjectCustomXml('<other xmlns="other"/>')).toBeNull();
  });

  it('returns null for a malformed / non-base64 payload', () => {
    expect(parseProjectCustomXml('<broadsetProject xmlns="https://broadset.io/ns/pptx/project/1.0/"/>')).toBeNull();
    expect(
      parseProjectCustomXml(
        '<broadsetProject xmlns="https://broadset.io/ns/pptx/project/1.0/"><document encoding="base64">not-valid-json-even-after-base64</document></broadsetProject>',
      ),
    ).toBeNull();
  });
});
