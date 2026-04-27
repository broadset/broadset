import type { AnimationDefinition } from '@broadset/model';

import { findChild, findDescendant, findDescendants, getAttr, parseOoxml, rootElement, type XmlElement } from '../ooxml/ast';
import { decodeShapeName } from '../semantic/shape-name';

/**
 * `<p:timing>` import. Walks a slide's timing tree looking for preset
 * entrance effects we can map back to Broadset animations — today:
 * PowerPoint's "Fade" (presetID="10", presetClass="entr"). Everything
 * else drops per IO-D-16; unmappable entries surface as import
 * warnings returned alongside the animation list.
 *
 * `<p:spTgt spid="N"/>` is the canonical OOXML element-target form.
 * We resolve `spid` back to the Broadset element id via each slide
 * shape's `<p:cNvPr id="N" name="BSET:{id}:…">` tag (decoded via
 * `semantic/shape-name`). Third-party PPTX without a BSET tag still
 * imports if the shape-id matches an element whose id we assigned
 * during parseSlideShapes — in that case the shape-id map is the
 * allocated `pptx-el-…` synthetic id.
 */

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

  // Walk every `<p:cTn>` with a `presetClass` attribute. Entrance
  // effects map to Broadset animations; everything else drops with a
  // warning per IO-D-16.
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

    const fade = extractFadeFromEntrance(cTn);

    if (fade === null) continue;

    const elementId = spidToElementId.get(fade.spid);

    if (elementId === undefined) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset entrance animation targets shape id ${fade.spid} which does not resolve to a Broadset element`,
      });
      continue;
    }

    animations.push(buildFadeAnimation(elementId, fade.durationMs));
  }

  return { animations, warnings };
}

/**
 * Walk an entrance `<p:cTn presetClass="entr">` looking for the inner
 * `<p:anim>` whose `<p:cTn dur="…"/>` carries the duration and whose
 * `<p:cBhvr><p:tgtEl><p:spTgt spid="…"/></p:tgtEl></p:cBhvr>` carries
 * the target shape id. Returns `null` when either is missing.
 */
function extractFadeFromEntrance(entranceCTn: XmlElement): { readonly durationMs: number; readonly spid: string } | null {
  const animNode = findDescendant(entranceCTn, 'p:anim');

  if (animNode === null) return null;

  const innerCTn = findDescendant(animNode, 'p:cTn');
  const dur = innerCTn !== null ? getAttr(innerCTn, 'dur') : undefined;
  const spTgt = findDescendant(animNode, 'p:spTgt');
  const spid = spTgt !== null ? getAttr(spTgt, 'spid') : undefined;

  if (dur === undefined || spid === undefined) return null;

  return { durationMs: parseInt(dur, 10), spid };
}

/**
 * Build a `spid → elementId` map by scanning slide shapes for their
 * `<p:cNvPr id="N" name="BSET:{id}:{kind}">` tags. Fallback uses the
 * display name as the element id (matches the parseSlideShapes naming
 * convention for untagged third-party shapes).
 */
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

function buildFadeAnimation(elementId: string, durationMs: number): AnimationDefinition {
  return {
    elementId,
    config: {
      timelines: [
        {
          id: `fade-${elementId}`,
          name: 'Fade',
          durationMs,
          keyframes: [
            {
              name: 'start',
              action: 'none',
              offsetMs: 0,
              properties: {
                opacity: { type: 'number', value: 0, easing: 'linear' },
              },
            },
            {
              name: 'end',
              action: 'none',
              offsetMs: durationMs,
              properties: {
                opacity: { type: 'number', value: 1, easing: 'linear' },
              },
            },
          ],
        },
      ],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: null,
    },
  };
}
