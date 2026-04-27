import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptx } from './import';
import { readOoxmlPackage, readTextPart } from './ooxml/zip';

/**
 * @description `<p:timing>` round-trip for the subset of animations
 * that map to PowerPoint presets or native timing nodes.
 */
describe('PPTX animation round-trip', () => {
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

  /**
   * @description Fly-in entrance: translateX or translateY animates
   * from non-zero to zero. The sign of the source coordinate encodes
   * the source edge — positive Y → from bottom, negative X → from left.
   */
  it('round-trips a fly-in (from bottom) animation via <p:timing>', () => {
    const doc = makeDocWithAnimation('fly-target', 'translateY', 100, 0);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);

    expect(imported.animations).toHaveLength(1);

    const tl = imported.animations[0]?.config.timelines[0];

    expect(tl?.name).toContain('Fly-in');
    expect(tl?.name).toContain('bottom');

    const startY = readAnimNumber(imported.animations[0]?.config.timelines[0]?.keyframes[0], 'translateY');
    const endY = readAnimNumber(imported.animations[0]?.config.timelines[0]?.keyframes[1], 'translateY');

    expect(startY).toBeGreaterThan(0);
    expect(endY).toBe(0);
  });

  /**
   * @description Fly-in (from left): negative translateX → zero. The
   * importer should produce a `translateX` keyframe with the right
   * direction encoded.
   */
  it('round-trips a fly-in (from left) animation via <p:timing>', () => {
    const doc = makeDocWithAnimation('fly-left', 'translateX', -100, 0);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(tl?.name).toContain('left');

    const startX = readAnimNumber(tl?.keyframes[0], 'translateX');

    expect(startX).toBeLessThan(0);
  });

  /**
   * @description Zoom-in: scale 0 → 1 maps to PowerPoint's
   * "Zoom" preset. Scale starts near 0 and lands at 1.
   */
  it('round-trips a zoom-in animation via <p:timing>', () => {
    const doc = makeDocWithAnimation('zoom-target', 'scale', 0, 1);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(tl?.name).toContain('Zoom');

    const startScale = readAnimNumber(tl?.keyframes[0], 'scale');
    const endScale = readAnimNumber(tl?.keyframes[1], 'scale');

    expect(startScale).toBe(0);
    expect(endScale).toBe(1);
  });

  /**
   * @description Wipe entrance: clipInsetLeft 1 → 0 emits PowerPoint's
   * "Wipe" preset. The animation pane recognises preset id 14 as the
   * canonical Wipe effect.
   */
  it('round-trips a wipe animation via <p:timing>', () => {
    const doc = makeDocWithAnimation('wipe-target', 'clipInsetLeft', 1, 0);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(tl?.name).toContain('Wipe');
  });

  /**
   * @description Rotate entrance: rotation animates from a non-zero
   * offset into the final zero-degree state and emits native
   * `<p:animRot>` rather than dropping as unsupported.
   */
  it('round-trips a rotate entrance animation via <p:animRot>', () => {
    const doc = makeDocWithAnimation('rotate-target', 'rotation', -360, 0);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const slideXml = readTextPart(readOoxmlPackage(bytes), 'ppt/slides/slide1.xml') ?? '';
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(slideXml).toContain('<p:animRot');
    expect(tl?.name).toContain('Rotate');
    expect(readAnimNumber(tl?.keyframes[0], 'rotation')).toBe(-360);
    expect(readAnimNumber(tl?.keyframes[1], 'rotation')).toBe(0);
  });

  /**
   * @description Motion-path timing: Broadset's SVG `motionPath`
   * keyframe maps to native OOXML `<p:animMotion path="…">` and
   * imports back as the same path string.
   */
  it('round-trips a motion-path animation via <p:animMotion>', () => {
    const path = 'M 0 0 L 120 40';
    const doc = makeDocWithStringAnimation('path-target', 'motionPath', path, path);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const slideXml = readTextPart(readOoxmlPackage(bytes), 'ppt/slides/slide1.xml') ?? '';
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(slideXml).toContain('<p:animMotion');
    expect(tl?.name).toContain('Motion path');
    expect(readAnimString(tl?.keyframes[0], 'motionPath')).toBe(path);
    expect(readAnimString(tl?.keyframes[1], 'motionPath')).toBe(path);
  });

  /**
   * @description Exit timing: an OUT-bound opacity timeline exports
   * as `presetClass="exit"` and imports back as a fade-out instead of
   * surfacing an unsupported-animation warning.
   */
  it('round-trips an exit fade animation via presetClass="exit"', () => {
    const doc = makeDocWithAnimation('exit-target', 'opacity', 1, 0, { stateBinding: 'OUT' });
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const slideXml = readTextPart(readOoxmlPackage(bytes), 'ppt/slides/slide1.xml') ?? '';
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(slideXml).toContain('presetClass="exit"');
    expect(tl?.name).toContain('Fade exit');
    expect(readAnimNumber(tl?.keyframes[0], 'opacity')).toBe(1);
    expect(readAnimNumber(tl?.keyframes[1], 'opacity')).toBe(0);
  });

  /**
   * @description Emphasis timing: modifier-bound rotation exports as
   * `presetClass="emph"` with `<p:animRot>` so spin-style emphasis
   * effects are no longer dropped.
   */
  it('round-trips an emphasis rotate animation via presetClass="emph"', () => {
    const doc = makeDocWithAnimation('emph-target', 'rotation', 0, 360, { modifierBinding: 'pulse' });
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const slideXml = readTextPart(readOoxmlPackage(bytes), 'ppt/slides/slide1.xml') ?? '';
    const imported = importPptx(bytes);
    const tl = imported.animations[0]?.config.timelines[0];

    expect(slideXml).toContain('presetClass="emph"');
    expect(slideXml).toContain('<p:animRot');
    expect(tl?.name).toContain('Rotate emphasis');
    expect(readAnimNumber(tl?.keyframes[0], 'rotation')).toBe(0);
    expect(readAnimNumber(tl?.keyframes[1], 'rotation')).toBe(360);
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

interface AnimationKeyframe {
  readonly properties: Readonly<Record<string, unknown>>;
}

interface AnimationOptions {
  readonly stateBinding?: 'IN' | 'OUT' | undefined;
  readonly modifierBinding?: string | undefined;
}

function makeDocWithAnimation(
  elementId: string,
  propertyName: string,
  startValue: number,
  endValue: number,
  options: AnimationOptions = {},
): ReturnType<typeof createEmptyBroadsetDocument> {
  const base = createEmptyBroadsetDocument();
  const el = createDefaultElement('rectangle', { id: elementId });
  const timelineId = 'tl-1';

  return {
    ...base,
    elements: [el],
    animations: [
      {
        elementId,
        config: {
          timelines: [
            {
              id: timelineId,
              name: 'Entrance',
              durationMs: 500,
              keyframes: [
                {
                  name: 'start',
                  action: 'none' as const,
                  offsetMs: 0,
                  properties: { [propertyName]: { type: 'number' as const, value: startValue, easing: 'linear' as const } },
                },
                {
                  name: 'end',
                  action: 'none' as const,
                  offsetMs: 500,
                  properties: { [propertyName]: { type: 'number' as const, value: endValue, easing: 'linear' as const } },
                },
              ],
            },
          ],
          stateTimelineBindings: options.stateBinding !== undefined ? [{ stateName: options.stateBinding, timelineId }] : [],
          modifierTimelineBindings:
            options.modifierBinding !== undefined ? [{ modifierName: options.modifierBinding, inTimelineId: timelineId }] : [],
          textAnimator: null,
        },
      },
    ],
  };
}

function makeDocWithStringAnimation(
  elementId: string,
  propertyName: string,
  startValue: string,
  endValue: string,
): ReturnType<typeof createEmptyBroadsetDocument> {
  const base = createEmptyBroadsetDocument();
  const el = createDefaultElement('rectangle', { id: elementId });

  return {
    ...base,
    elements: [el],
    animations: [
      {
        elementId,
        config: {
          timelines: [
            {
              id: 'tl-1',
              name: 'Motion path',
              durationMs: 500,
              keyframes: [
                {
                  name: 'start',
                  action: 'none' as const,
                  offsetMs: 0,
                  properties: { [propertyName]: { type: 'string' as const, value: startValue, easing: 'linear' as const } },
                },
                {
                  name: 'end',
                  action: 'none' as const,
                  offsetMs: 500,
                  properties: { [propertyName]: { type: 'string' as const, value: endValue, easing: 'linear' as const } },
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

function readAnimNumber(keyframe: AnimationKeyframe | undefined, propertyName: string): number | undefined {
  if (keyframe === undefined) return undefined;

  const value = keyframe.properties[propertyName];

  if (typeof value !== 'object' || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const raw = record['value'];

  return typeof raw === 'number' ? raw : undefined;
}

function readAnimString(keyframe: AnimationKeyframe | undefined, propertyName: string): string | undefined {
  if (keyframe === undefined) return undefined;

  const value = keyframe.properties[propertyName];

  if (typeof value !== 'object' || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const raw = record['value'];

  return typeof raw === 'string' ? raw : undefined;
}
