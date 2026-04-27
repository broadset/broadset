import type { AnimationDefinition, BroadsetDocument } from '@broadset/model';

import { pushExportWarning, type SlideExportContext } from './context';

/**
 * `<p:timing>` export. Emits a native OOXML timing tree for the subset
 * of Broadset animations that map cleanly to PowerPoint's preset
 * entrance effects — today: **fade-in**. Unmappable animations drop
 * per IO-D-16 (no custom-XML preservation of animation data; the
 * `.bsp` is the source of truth) and record an
 * `animation-preset-unsupported` warning on the slide context.
 *
 * The emitted tree matches PowerPoint's canonical "Fade" entrance
 * effect so the imported animation plays in PowerPoint's Animation
 * Pane as a first-class preset.
 */

interface MappableFadeEntry {
  readonly elementId: string;
  readonly shapeId: number;
  readonly durationMs: number;
}

export function buildTimingXml(document: BroadsetDocument, ctx: SlideExportContext): string {
  const fades = collectFadeEntries(document.animations, ctx);

  if (fades.length === 0) return '';

  const effects = fades.map((fade) => emitFadeEffect(fade)).join('');

  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${effects}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

function collectFadeEntries(
  animations: readonly AnimationDefinition[],
  ctx: SlideExportContext,
): readonly MappableFadeEntry[] {
  const result: MappableFadeEntry[] = [];

  for (const anim of animations) {
    const shapeId = ctx.shapeIdByElementId.get(anim.elementId);

    // Animations whose target element isn't in this slide aren't a
    // fidelity loss — they belong to a different page and will (or
    // won't) emit there. Only animations targeting elements present
    // here that fail the fade-in heuristic are real drops.
    if (shapeId === undefined) continue;

    const duration = detectFadeInDuration(anim);

    if (duration === null) {
      pushExportWarning(ctx, {
        code: 'animation-preset-unsupported',
        message: `animation on element "${anim.elementId}" cannot be mapped to a PowerPoint preset entrance effect; dropped per IO-D-16`,
        elementId: anim.elementId,
      });
      continue;
    }

    result.push({ elementId: anim.elementId, shapeId, durationMs: duration });
  }

  return result;
}

/**
 * A Broadset animation maps to a fade-in entry when its first timeline
 * has an opacity keyframe transitioning from ~0 to ~1 within the first
 * 1.5 seconds. Returns the duration in milliseconds, or null when the
 * animation isn't a fade entry.
 */
function detectFadeInDuration(anim: AnimationDefinition): number | null {
  const timeline = anim.config.timelines[0];

  if (timeline === undefined) return null;

  const keyframes = timeline.keyframes;

  if (keyframes.length < 2) return null;

  const [start, end] = [keyframes[0], keyframes[keyframes.length - 1]];

  if (start === undefined || end === undefined) return null;

  const startOpacity = readOpacityFromProperties(start.properties);
  const endOpacity = readOpacityFromProperties(end.properties);

  if (startOpacity === null || endOpacity === null) return null;
  if (startOpacity >= 0.05 || endOpacity <= 0.95) return null;

  const duration = end.offsetMs - start.offsetMs;

  if (duration <= 0 || duration > 1500) return null;

  return duration;
}

function readOpacityFromProperties(properties: Readonly<Record<string, unknown>>): number | null {
  const value = properties['opacity'];

  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const rawValue = record['value'];

  return typeof rawValue === 'number' ? rawValue : null;
}

function emitFadeEffect(fade: MappableFadeEntry): string {
  const duration = String(fade.durationMs);
  const spid = String(fade.shapeId);

  // PowerPoint preset entrance: Fade (presetID=10, presetClass="entr",
  // presetSubtype=0). The timing tree below is the minimum that opens
  // in PowerPoint's Animation Pane as "Fade" on the target shape.
  // `<p:spTgt spid="…"/>` is the canonical OOXML element-target form —
  // referring to the shape by its slide-local `<p:cNvPr id="…"/>`.
  return `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="7" dur="${duration}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.opacity</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
}
