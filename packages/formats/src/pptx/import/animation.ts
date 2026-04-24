import type { AnimationDefinition } from '@broadset/model';

/**
 * `<p:timing>` import. Walks a slide's timing tree looking for preset
 * entrance effects we can map back to Broadset animations — today:
 * PowerPoint's "Fade" (presetID="10", presetClass="entr"). Everything
 * else is dropped per IO-D-16 with an import warning.
 *
 * Broadset-exported PPTX tags target shapes with a `bset-id` attribute
 * on `<p:spTgt>` so re-import can find the source element without
 * resolving shape-id ↔ element-id through the rels table. Third-party
 * decks without the tag still import via the shape-id path once the
 * id map is available (P8.5 follow-up).
 */

export function parseTimingAnimations(slideXml: string): readonly AnimationDefinition[] {
  const timingMatch = slideXml.match(/<p:timing\b[\s\S]*?<\/p:timing>/);

  if (!timingMatch) return [];

  const timing = timingMatch[0];
  const animations: AnimationDefinition[] = [];

  // Match every `<p:par ... presetClass="entr"` block and extract the
  // duration + target element id.
  for (const match of timing.matchAll(
    /<p:cTn\b[^>]*presetClass="entr"[^>]*>[\s\S]*?<p:anim\b[^>]*>[\s\S]*?<p:cTn\b[^>]*\bdur="(\d+)"[\s\S]*?bset-id="([^"]+)"/g,
  )) {
    const duration = parseInt(match[1] ?? '500', 10);
    const elementId = match[2] ?? '';

    if (elementId.length === 0) continue;
    animations.push(buildFadeAnimation(elementId, duration));
  }

  return animations;
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
