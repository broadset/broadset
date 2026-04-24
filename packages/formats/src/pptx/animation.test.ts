import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptx } from './import';

/**
 * @description `<p:timing>` round-trip for the subset of animations
 * that map to PowerPoint presets. Today the mappable set is
 * fade-entry. Everything else drops per IO-D-16.
 */
describe('PPTX animation round-trip — fade-entry', () => {
  it('emits and re-parses a fade-in animation via <p:timing>', () => {
    const base = createEmptyBroadsetDocument();
    const el = createDefaultElement('rectangle', { id: 'fade-target' });
    const doc = {
      ...base,
      elements: [el],
      animations: [
        {
          elementId: 'fade-target',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'Entrance',
                durationMs: 500,
                keyframes: [
                  { name: 'start', action: 'none' as const, offsetMs: 0, properties: { opacity: { type: 'number' as const, value: 0, easing: 'linear' as const } } },
                  { name: 'end', action: 'none' as const, offsetMs: 500, properties: { opacity: { type: 'number' as const, value: 1, easing: 'linear' as const } } },
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
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);

    expect(imported.animations).toHaveLength(1);
    expect(imported.animations[0]?.elementId).toBe('fade-target');
    expect(imported.animations[0]?.config.timelines[0]?.durationMs).toBe(500);
  });

  it('drops animations that do not map to a preset', () => {
    const base = createEmptyBroadsetDocument();
    const el = createDefaultElement('rectangle', { id: 'custom-target' });
    // A non-opacity keyframe (colour transition) doesn't map to fade.
    const doc = {
      ...base,
      elements: [el],
      animations: [
        {
          elementId: 'custom-target',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'ColorFade',
                durationMs: 500,
                keyframes: [
                  { name: 'a', action: 'none' as const, offsetMs: 0, properties: { color: { type: 'color' as const, value: '#ff0000', easing: 'linear' as const } } },
                  { name: 'b', action: 'none' as const, offsetMs: 500, properties: { color: { type: 'color' as const, value: '#00ff00', easing: 'linear' as const } } },
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
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);

    expect(imported.animations).toEqual([]);
  });
});
