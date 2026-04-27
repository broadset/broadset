import type { AnimationDefinition, KeyframeValue, NumberKeyframeValue } from '@broadset/model';

import { findChild, findDescendant, findDescendants, getAttr, parseOoxml, rootElement, type XmlElement } from '../ooxml/ast';
import { decodeShapeName } from '../semantic/shape-name';

/**
 * `<p:timing>` import. Walks a slide's timing tree looking for preset
 * entrance effects we can map back to Broadset animations.
 *
 * Mappable presets (each pairs with the export side):
 * - **Fade** (preset id 10) — opacity 0 → 1
 * - **Fly-in** (preset id 2) — translateX/translateY non-zero → 0;
 *   subtype encodes direction (1 right, 2 top, 4 bottom, 8 left)
 * - **Zoom** (preset id 23) — scale 0 → 1
 * - **Wipe** (preset id 14) — clipInsetLeft 1 → 0
 *
 * Anything outside this set drops with an `unsupported-animation`
 * warning per IO-D-16; the `.bsp` is the source of truth.
 *
 * `<p:spTgt spid="N"/>` is the canonical OOXML element-target form;
 * we resolve `spid` back to the Broadset element id via each slide
 * shape's `<p:cNvPr id="N" name="BSET:{id}:…">` tag.
 */

const PRESET_FADE = '10';
const PRESET_FLY_IN = '2';
const PRESET_ZOOM = '23';
const PRESET_WIPE = '14';

/** Preset subtype → fly-in source edge. */
const FLY_SUBTYPE_TO_DIRECTION: Readonly<Record<string, 'top' | 'right' | 'bottom' | 'left'>> = {
  '1': 'right',
  '2': 'top',
  '4': 'bottom',
  '8': 'left',
};

const FLY_OFFSET_PIXELS = 100;

export interface ParsedTimingResult {
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

    if (presetClass !== 'entr') {
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

    const built = buildAnimationForPreset(elementId, presetId, presetSubtype, tgt.durationMs);

    if (built === null) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset entrance id "${presetId}" is not yet mappable to Broadset animations`,
      });
      continue;
    }

    animations.push(built);
  }

  return { animations, warnings };
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
function extractTargetFromEntrance(entranceCTn: XmlElement): { readonly durationMs: number; readonly spid: string } | null {
  const spTgt = findDescendant(entranceCTn, 'p:spTgt');
  const spid = spTgt !== null ? getAttr(spTgt, 'spid') : undefined;

  if (spid === undefined) return null;

  // Prefer the `<p:anim>` inner duration when present (matches
  // PowerPoint's Fade tween); otherwise fall back to a containing
  // `<p:cTn dur="…">`.
  const animNode = findDescendant(entranceCTn, 'p:anim');
  const animCTn = animNode !== null ? findDescendant(animNode, 'p:cTn') : null;
  const innerDur = animCTn !== null ? getAttr(animCTn, 'dur') : undefined;
  const fallbackDur = readDurationFromAncestors(entranceCTn);
  const dur = innerDur ?? fallbackDur ?? '500';

  return { durationMs: parseInt(dur, 10), spid };
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
): AnimationDefinition | null {
  if (presetId === PRESET_FADE) return buildSinglePropertyAnimation(elementId, 'opacity', 0, 1, durationMs, 'Fade');

  if (presetId === PRESET_ZOOM) return buildSinglePropertyAnimation(elementId, 'scale', 0, 1, durationMs, 'Zoom');

  if (presetId === PRESET_WIPE) return buildSinglePropertyAnimation(elementId, 'clipInsetLeft', 1, 0, durationMs, 'Wipe');

  if (presetId === PRESET_FLY_IN) {
    const direction = FLY_SUBTYPE_TO_DIRECTION[presetSubtype] ?? 'bottom';
    const axis = direction === 'top' || direction === 'bottom' ? 'translateY' : 'translateX';
    const sign = direction === 'right' || direction === 'bottom' ? 1 : -1;

    return buildSinglePropertyAnimation(elementId, axis, FLY_OFFSET_PIXELS * sign, 0, durationMs, `Fly-in (${direction})`);
  }

  return null;
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
