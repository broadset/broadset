import type { BroadsetDocument } from '@broadset/model';
import { createDefaultElement, createEmptyBroadsetDocument, rgbColor } from '@broadset/model';

/**
 * Canonical Broadset document used by the LibreOffice-headless and
 * Open XML SDK XSD validators. Covers every Broadset element kind a
 * single page can hold so a structural regression in any of the
 * exporter's per-kind emit paths surfaces in CI.
 *
 * Element coverage:
 *   - rectangle, ellipse — preset geometry
 *   - text — paragraph + run with default fontFamily
 *   - path — `<a:custGeom>` lines
 *   - image — embedded data-URI (32x32 PNG)
 *   - svg — inline `<svg>` content
 *   - group — `<p:grpSp>` with two children
 *   - qrcode — emits as a grouped picture per the QR exporter
 *
 * Document-level coverage:
 *   - gradient slide background — `<p:bg><a:gradFill>`
 *   - multi-page — three pages with overrides on the second page
 *   - one mappable entrance animation — `<p:timing>` with a fade
 *
 * Used by `pptx/libreoffice-verify.test.ts`, `pptx/openxml-xsd-validate.test.ts`,
 * and any future "open cleanly in $TOOL" gate. Keep this fixture
 * intentionally minimal-but-comprehensive — adding a new element kind
 * here is the cheapest way to gate against a regression in that
 * kind's emit path.
 */

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAACklEQVR4AWNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==';

export function buildCanonicalDocument(): BroadsetDocument {
  const baseDoc = createEmptyBroadsetDocument();

  return {
    ...baseDoc,
    canvas: {
      ...baseDoc.canvas,
      backgroundColor: '#FFFFFF',
      backgroundMode: 'gradient',
      backgroundGradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { color: rgbColor('#FFFFFF'), position: 0 },
          { color: rgbColor('#1F2937'), position: 1 },
        ],
      },
    },
    elements: [
      createDefaultElement('rectangle', {
        id: 'rect-1',
        name: 'Rectangle',
        position: { x: 10, y: 10 },
        width: 60,
        height: 40,
      }),
      createDefaultElement('ellipse', {
        id: 'ellipse-1',
        name: 'Ellipse',
        position: { x: 80, y: 12 },
        width: 50,
        height: 35,
      }),
      createDefaultElement('text', {
        id: 'text-1',
        name: 'Caption',
        position: { x: 10, y: 60 },
        width: 130,
        height: 18,
        content: 'Canonical caption.',
      }),
      createDefaultElement('path', {
        id: 'path-1',
        name: 'Triangle path',
        position: { x: 10, y: 90 },
        width: 60,
        height: 40,
        content: 'M 0 0 L 100 0 L 100 100 Z',
      }),
      createDefaultElement('image', {
        id: 'image-1',
        name: 'Tiny image',
        position: { x: 80, y: 60 },
        width: 32,
        height: 32,
        content: `data:image/png;base64,${TINY_PNG_BASE64}`,
      }),
      createDefaultElement('svg', {
        id: 'svg-1',
        name: 'Inline SVG',
        position: { x: 80, y: 100 },
        width: 32,
        height: 32,
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#22C55E"/></svg>',
      }),
      createDefaultElement('qrcode', {
        id: 'qr-1',
        name: 'QR Code',
        position: { x: 130, y: 60 },
        width: 32,
        height: 32,
        content: 'https://broadset.io',
      }),
      createDefaultElement('group', {
        id: 'group-1',
        name: 'Group',
        position: { x: 10, y: 140 },
        width: 60,
        height: 30,
      }),
      createDefaultElement('rectangle', {
        id: 'group-child-rect',
        name: 'Group child rect',
        groupId: 'group-1',
        position: { x: 10, y: 140 },
        width: 28,
        height: 30,
      }),
      createDefaultElement('ellipse', {
        id: 'group-child-ellipse',
        name: 'Group child ellipse',
        groupId: 'group-1',
        position: { x: 42, y: 140 },
        width: 28,
        height: 30,
      }),
    ],
    pages: [
      { id: 'page-1', name: 'Cover', elements: [], locale: 'en-US', extensions: {} },
      {
        id: 'page-2',
        name: 'Edited',
        elements: [
          {
            elementId: 'rect-1',
            transform: {
              position: { x: 30, y: 30, z: 0 },
              rotation: { x: 0, y: 0, z: 15 },
              scale: { x: 1, y: 1, z: 1 },
            },
            visible: true,
          },
        ],
        locale: 'en-US',
        extensions: {},
      },
      { id: 'page-3', name: 'Outro', elements: [], locale: 'en-US', extensions: {} },
    ],
    animations: [
      {
        elementId: 'rect-1',
        config: {
          timelines: [
            {
              id: 'tl-fade-in',
              name: 'Entrance',
              durationMs: 500,
              keyframes: [
                {
                  name: 'start',
                  action: 'none' as const,
                  offsetMs: 0,
                  properties: { opacity: { type: 'number' as const, value: 0, easing: 'linear' as const } },
                },
                {
                  name: 'end',
                  action: 'none' as const,
                  offsetMs: 500,
                  properties: { opacity: { type: 'number' as const, value: 1, easing: 'linear' as const } },
                },
              ],
            },
          ],
          stateTimelineBindings: [],
          modifierTimelineBindings: [],
          textAnimator: null,
        },
      },
    ],
  };
}
