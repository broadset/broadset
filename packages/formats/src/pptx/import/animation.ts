import type { AnimationDefinition, KeyframeValue, NumberKeyframeValue, StringKeyframeValue } from '@broadset/model';

import {
  findChild,
  findDescendant,
  findDescendants,
  getAttr,
  parseOoxml,
  rootElement,
  type XmlElement,
} from '../ooxml/ast';
import { decodeShapeName } from '../semantic/shape-name';

/**
 * `<p:timing>` import. Walks a slide's timing tree looking for preset
 * effects we can map back to Broadset animations.
 *
 * Mappable presets (each pairs with the export side):
 * - **Fade** (preset id 10) — opacity 0 → 1
 * - **Fly-in** (preset id 2) — translateX/translateY non-zero → 0;
 *   subtype encodes direction (1 right, 2 top, 4 bottom, 8 left)
 * - **Zoom** (preset id 23) — scale 0 → 1
 * - **Wipe** (preset id 14) — clipInsetLeft 1 → 0
 *
 * Rotate effects additionally map via native `<p:animRot>` and motion
 * paths map via native `<p:animMotion>`. Entrance, exit, emphasis, and
 * path timing classes are accepted; anything outside the supported
 * preset/node set drops with an `unsupported-animation` warning per
 * IO-D-16; the `.bsp` is the source of truth.
 *
 * `<p:spTgt spid="N"/>` is the canonical OOXML element-target form;
 * we resolve `spid` back to the Broadset element id via each slide
 * shape's `<p:cNvPr id="N" name="BSET:{id}:…">` tag.
 */

const PRESET_FADE = '10';
const PRESET_FLY_IN = '2';
const PRESET_ZOOM = '23';
const PRESET_WIPE = '14';
const PRESET_ROTATE = '8';
const PRESET_MOTION_PATH = '64';
const ROTATION_UNITS_PER_DEGREE = 60000;

/** Preset subtype → fly-in source edge. */
const FLY_SUBTYPE_TO_DIRECTION: Readonly<Record<string, 'top' | 'right' | 'bottom' | 'left'>> = {
  '1': 'right',
  '2': 'top',
  '4': 'bottom',
  '8': 'left',
};

const FLY_OFFSET_PIXELS = 100;
const DEFAULT_EMPHASIS_OPACITY = 0.5;
const DEFAULT_EMPHASIS_SCALE = 1.25;

type TimingClass = 'entr' | 'exit' | 'emph' | 'path';

interface ParsedTimingResult {
  readonly animations: readonly AnimationDefinition[];
  readonly warnings: readonly { readonly code: 'unsupported-animation'; readonly message: string }[];
}

export function parseTimingAnimations(slideXml: string): ParsedTimingResult {
  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return { animations: [], warnings: [] };

  const timing = findChild(root, 'p:timing');

  if (timing === null) return { animations: [], warnings: [] };

  const animations: AnimationDefinition[] = [];
  const warnings: ParsedTimingResult['warnings'] extends readonly (infer U)[] ? U[] : never[] = [];
  const spidToElementId = buildSpidToElementIdMap(root);

  for (const cTn of findDescendants(timing, 'p:cTn')) {
    const presetClass = getAttr(cTn, 'presetClass');

    if (presetClass === undefined) continue;

    const timingClass = parseTimingClass(presetClass);

    if (timingClass === null) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset class "${presetClass}" is not yet mappable to Broadset animations`,
      });
      continue;
    }

    const presetId = getAttr(cTn, 'presetID') ?? '';
    const presetSubtype = getAttr(cTn, 'presetSubtype') ?? '0';
    const tgt = extractTargetFromEntrance(cTn);

    if (tgt === null) continue;

    const elementId = spidToElementId.get(tgt.spid);

    if (elementId === undefined) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset entrance animation targets shape id ${tgt.spid} which does not resolve to a Broadset element`,
      });
      continue;
    }

    const built = buildAnimationForPreset(elementId, presetId, presetSubtype, tgt.durationMs, timingClass, cTn);

    if (built === null) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset ${timingClass} id "${presetId}" is not yet mappable to Broadset animations`,
      });
      continue;
    }

    animations.push(built);
  }

  return { animations, warnings };
}

function parseTimingClass(value: string): TimingClass | null {
  if (value === 'entr' || value === 'exit' || value === 'emph' || value === 'path') return value;

  return null;
}

/**
 * Walk an entrance `<p:cTn presetClass="entr">` to find the target
 * shape id and animation duration. Different presets place the
 * duration in different inner nodes — fade has an `<p:anim>` with a
 * `<p:cTn dur="…"/>`, while fly-in / zoom / wipe lean on a `<p:set>`
 * for visibility plus the parent's implicit duration. We probe both
 * forms and fall back to the parent `<p:cTn dur>` when the inner is
 * absent.
 */
function extractTargetFromEntrance(
  entranceCTn: XmlElement,
): { readonly durationMs: number; readonly spid: string } | null {
  const spTgt = findDescendant(entranceCTn, 'p:spTgt');
  const spid = spTgt !== null ? getAttr(spTgt, 'spid') : undefined;

  if (spid === undefined) return null;

  // Prefer the `<p:anim>` inner duration when present (matches
  // PowerPoint's Fade tween); otherwise fall back to a containing
  // `<p:cTn dur="…">`.
  const animNode = findTimingPayloadNode(entranceCTn);
  const animCTn = animNode !== null ? findDescendant(animNode, 'p:cTn') : null;
  const innerDur = animCTn !== null ? getAttr(animCTn, 'dur') : undefined;
  const fallbackDur = readDurationFromAncestors(entranceCTn);
  const dur = innerDur ?? fallbackDur ?? '500';

  return { durationMs: parseInt(dur, 10), spid };
}

function findTimingPayloadNode(node: XmlElement): XmlElement | null {
  return findDescendant(node, 'p:anim') ?? findDescendant(node, 'p:animRot') ?? findDescendant(node, 'p:animMotion');
}

function readDurationFromAncestors(node: XmlElement): string | undefined {
  for (const child of findDescendants(node, 'p:cTn')) {
    const dur = getAttr(child, 'dur');

    if (dur !== undefined && dur !== 'indefinite' && dur !== '1') return dur;
  }

  return undefined;
}

function buildSpidToElementIdMap(root: XmlElement): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const cNvPr of findDescendants(root, 'p:cNvPr')) {
    const id = getAttr(cNvPr, 'id');
    const name = getAttr(cNvPr, 'name') ?? '';

    if (id === undefined) continue;

    const bsetTag = name.length > 0 ? decodeShapeName(name) : null;

    map.set(id, bsetTag?.id ?? name);
  }

  return map;
}

function buildAnimationForPreset(
  elementId: string,
  presetId: string,
  presetSubtype: string,
  durationMs: number,
  timingClass: TimingClass,
  effectNode: XmlElement,
): AnimationDefinition | null {
  const motionPath = readMotionPath(effectNode);

  if (presetId === PRESET_MOTION_PATH || motionPath !== null) {
    return buildMotionPathAnimation(
      elementId,
      motionPath ?? 'M 0 0 L 0 0',
      durationMs,
      labelFor('Motion path', timingClass),
    );
  }

  const rotation = readRotation(effectNode, timingClass);

  if (presetId === PRESET_ROTATE || rotation !== null) {
    const values = rotation ?? defaultRotationValues(timingClass);

    return buildSinglePropertyAnimation(
      elementId,
      'rotation',
      values.from,
      values.to,
      durationMs,
      labelFor('Rotate', timingClass),
    );
  }

  if (presetId === PRESET_FADE) {
    const values = readOpacityValues(effectNode, timingClass);

    return buildSinglePropertyAnimation(
      elementId,
      'opacity',
      values.from,
      values.to,
      durationMs,
      labelFor('Fade', timingClass),
    );
  }

  if (presetId === PRESET_ZOOM) {
    const values = defaultZoomValues(timingClass);

    return buildSinglePropertyAnimation(
      elementId,
      'scale',
      values.from,
      values.to,
      durationMs,
      labelFor('Zoom', timingClass),
    );
  }

  if (presetId === PRESET_WIPE) {
    const values = defaultWipeValues(timingClass);

    return buildSinglePropertyAnimation(
      elementId,
      'clipInsetLeft',
      values.from,
      values.to,
      durationMs,
      labelFor('Wipe', timingClass),
    );
  }

  if (presetId === PRESET_FLY_IN) {
    const direction = FLY_SUBTYPE_TO_DIRECTION[presetSubtype] ?? 'bottom';
    const axis = direction === 'top' || direction === 'bottom' ? 'translateY' : 'translateX';
    const sign = direction === 'right' || direction === 'bottom' ? 1 : -1;
    const values =
      timingClass === 'exit' ? { from: 0, to: FLY_OFFSET_PIXELS * sign } : { from: FLY_OFFSET_PIXELS * sign, to: 0 };

    return buildSinglePropertyAnimation(
      elementId,
      axis,
      values.from,
      values.to,
      durationMs,
      `${flyLabelFor(timingClass)} (${direction})`,
    );
  }

  return null;
}

interface NumericRange {
  readonly from: number;
  readonly to: number;
}

function labelFor(base: string, timingClass: TimingClass): string {
  if (timingClass === 'exit') return `${base} exit`;
  if (timingClass === 'emph') return `${base} emphasis`;
  if (timingClass === 'path') return base;

  return base;
}

function flyLabelFor(timingClass: TimingClass): string {
  if (timingClass === 'entr') return 'Fly-in';
  if (timingClass === 'exit') return 'Fly-out';
  if (timingClass === 'emph') return 'Fly emphasis';

  return 'Fly';
}

function readOpacityValues(effectNode: XmlElement, timingClass: TimingClass): NumericRange {
  const values = findDescendants(effectNode, 'p:fltVal')
    .map((node) => Number(getAttr(node, 'val')))
    .filter((value) => Number.isFinite(value));

  const first = values[0];
  const last = values[values.length - 1];

  if (first !== undefined && last !== undefined) return { from: first, to: last };
  if (timingClass === 'exit') return { from: 1, to: 0 };
  if (timingClass === 'emph') return { from: 1, to: DEFAULT_EMPHASIS_OPACITY };

  return { from: 0, to: 1 };
}

function defaultZoomValues(timingClass: TimingClass): NumericRange {
  if (timingClass === 'exit') return { from: 1, to: 0 };
  if (timingClass === 'emph') return { from: 1, to: DEFAULT_EMPHASIS_SCALE };

  return { from: 0, to: 1 };
}

function defaultWipeValues(timingClass: TimingClass): NumericRange {
  if (timingClass === 'exit') return { from: 0, to: 1 };
  if (timingClass === 'emph') return { from: 0.5, to: 0 };

  return { from: 1, to: 0 };
}

function defaultRotationValues(timingClass: TimingClass): NumericRange {
  if (timingClass === 'entr') return { from: -360, to: 0 };

  return { from: 0, to: 360 };
}

function readRotation(effectNode: XmlElement, timingClass: TimingClass): NumericRange | null {
  const animRot = findDescendant(effectNode, 'p:animRot');

  if (animRot === null) return null;

  const from = parseRotationAttr(getAttr(animRot, 'from'));
  const to = parseRotationAttr(getAttr(animRot, 'to'));
  const by = parseRotationAttr(getAttr(animRot, 'by'));

  if (from !== null && to !== null) return { from, to };
  if (by !== null) return { from: 0, to: by };

  return defaultRotationValues(timingClass);
}

function parseRotationAttr(value: string | undefined): number | null {
  if (value === undefined) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed / ROTATION_UNITS_PER_DEGREE : null;
}

function readMotionPath(effectNode: XmlElement): string | null {
  const animMotion = findDescendant(effectNode, 'p:animMotion');

  return animMotion !== null ? (getAttr(animMotion, 'path') ?? null) : null;
}

function buildSinglePropertyAnimation(
  elementId: string,
  propertyName: string,
  startValue: number,
  endValue: number,
  durationMs: number,
  label: string,
): AnimationDefinition {
  const startProp: NumberKeyframeValue = { type: 'number', value: startValue, easing: 'linear' };
  const endProp: NumberKeyframeValue = { type: 'number', value: endValue, easing: 'linear' };
  const startProperties: Readonly<Record<string, KeyframeValue>> = { [propertyName]: startProp };
  const endProperties: Readonly<Record<string, KeyframeValue>> = { [propertyName]: endProp };

  return {
    elementId,
    config: {
      timelines: [
        {
          id: `${propertyName}-${elementId}`,
          name: label,
          durationMs,
          keyframes: [
            { name: 'start', action: 'none', offsetMs: 0, properties: startProperties },
            { name: 'end', action: 'none', offsetMs: durationMs, properties: endProperties },
          ],
        },
      ],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: null,
    },
  };
}

function buildMotionPathAnimation(
  elementId: string,
  path: string,
  durationMs: number,
  label: string,
): AnimationDefinition {
  const pathProp: StringKeyframeValue = { type: 'string', value: path, easing: 'linear' };
  const startProperties: Readonly<Record<string, KeyframeValue>> = { motionPath: pathProp };
  const endProperties: Readonly<Record<string, KeyframeValue>> = { motionPath: pathProp };

  return {
    elementId,
    config: {
      timelines: [
        {
          id: `motionPath-${elementId}`,
          name: label,
          durationMs,
          keyframes: [
            { name: 'start', action: 'none', offsetMs: 0, properties: startProperties },
            { name: 'end', action: 'none', offsetMs: durationMs, properties: endProperties },
          ],
        },
      ],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: null,
    },
  };
}
