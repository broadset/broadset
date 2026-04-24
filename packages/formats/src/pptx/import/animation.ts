import type { AnimationDefinition } from '@broadset/model';

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
  const timingMatch = slideXml.match(/<p:timing\b[\s\S]*?<\/p:timing>/);

  if (!timingMatch) return { animations: [], warnings: [] };

  const timing = timingMatch[0];
  const animations: AnimationDefinition[] = [];
  const warnings: ParsedTimingResult['warnings'] extends readonly (infer U)[] ? U[] : never[] = [];

  const spidToElementId = buildSpidToElementIdMap(slideXml);

  // Each `<p:par>` entrance block wraps a `<p:cTn presetClass="entr">`
  // around one or more `<p:anim>` children. We walk preset blocks and
  // extract the target spid + duration.
  for (const match of timing.matchAll(
    /<p:cTn\b[^>]*presetClass="entr"[^>]*>[\s\S]*?<p:anim\b[^>]*>[\s\S]*?<p:cTn\b[^>]*\bdur="(\d+)"[\s\S]*?<p:spTgt\b[^/>]*\bspid="(\d+)"/g,
  )) {
    const duration = parseInt(match[1] ?? '500', 10);
    const spid = match[2] ?? '';
    const elementId = spidToElementId.get(spid);

    if (elementId === undefined) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset entrance animation targets shape id ${spid} which does not resolve to a Broadset element`,
      });
      continue;
    }

    animations.push(buildFadeAnimation(elementId, duration));
  }

  // Any `<p:cTn presetClass="…">` whose class is NOT `entr` is dropped
  // with a warning — exit / emphasis / mpath effects are not yet
  // mappable. We scan for any preset class and skip the 'entr' ones
  // (already handled above).
  for (const match of timing.matchAll(/<p:cTn\b[^>]*\bpresetClass="([^"]+)"/g)) {
    const presetClass = match[1];

    if (presetClass !== 'entr' && presetClass !== undefined) {
      warnings.push({
        code: 'unsupported-animation',
        message: `Preset class "${presetClass}" is not yet mappable to Broadset animations`,
      });
    }
  }

  return { animations, warnings };
}

/**
 * Build a `spid → elementId` map by scanning slide shapes for their
 * `<p:cNvPr id="N" name="BSET:{id}:{kind}">` tags. Fallback uses the
 * display name as the element id (matches the parseSlideShapes naming
 * convention for untagged third-party shapes).
 */
function buildSpidToElementIdMap(slideXml: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const match of slideXml.matchAll(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/g)) {
    const id = match[1];
    const rawName = match[2] ?? '';

    if (id === undefined) continue;

    const bsetTag = rawName.length > 0 ? decodeShapeName(rawName) : null;

    map.set(id, bsetTag?.id ?? rawName);
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
