import type { AnimationDefinition, BroadsetDocument, Keyframe } from '@broadset/model';

import { pushExportWarning, type SlideExportContext } from './context';

/**
 * `<p:timing>` export. Emits a native OOXML timing tree for the subset
 * of Broadset animations that map cleanly to PowerPoint's preset
 * entrance effects.
 *
 * Supported presets (each of these maps both ways with the importer):
 * - **fade-in** — opacity 0 → 1 (PowerPoint preset id 10)
 * - **fly-in** — translateX or translateY non-zero → 0 (preset id 2,
 *   subtype encodes direction: 4 = from-bottom, 8 = from-left,
 *   2 = from-top, 1 = from-right)
 * - **zoom-in** — scale ≤0.1 → 1 (preset id 23)
 * - **wipe** — opacity 0 → 1 plus a styled-clip transition that
 *   PowerPoint detects as a wipe entrance (preset id 14, subtype
 *   8 = wipe-from-left default)
 *
 * Animations that don't fit one of these heuristics drop with a
 * structured `animation-preset-unsupported` warning per IO-D-16.
 */

/** OOXML preset entrance effect IDs we emit. ECMA-376 §19.5.51. */
const PRESET_FADE = 10;
const PRESET_FLY_IN = 2;
const PRESET_ZOOM = 23;
const PRESET_WIPE = 14;

/** Direction subtypes for fly-in (`<p:cTn presetSubtype="…"/>`). */
const FLY_FROM_RIGHT = 1;
const FLY_FROM_TOP = 2;
const FLY_FROM_BOTTOM = 4;
const FLY_FROM_LEFT = 8;

type FlyDirection = 'top' | 'right' | 'bottom' | 'left';

interface MappableEntry {
  readonly elementId: string;
  readonly shapeId: number;
  readonly durationMs: number;
  readonly preset: 'fade' | 'fly-in' | 'zoom' | 'wipe';
  readonly direction?: FlyDirection;
}

export function buildTimingXml(document: BroadsetDocument, ctx: SlideExportContext): string {
  const entries = collectMappableEntries(document.animations, ctx);

  if (entries.length === 0) return '';

  let nextNodeId = 3;
  const effects = entries
    .map((entry) => {
      const xml = emitPresetEffect(entry, nextNodeId);

      // Each effect block consumes 5 ids — one per nested cTn/anim.
      nextNodeId += 5;

      return xml;
    })
    .join('');

  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${effects}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

function collectMappableEntries(
  animations: readonly AnimationDefinition[],
  ctx: SlideExportContext,
): readonly MappableEntry[] {
  const result: MappableEntry[] = [];

  for (const anim of animations) {
    const shapeId = ctx.shapeIdByElementId.get(anim.elementId);

    // Animations whose target element isn't in this slide aren't a
    // fidelity loss — they belong to a different page and will (or
    // won't) emit there.
    if (shapeId === undefined) continue;

    const detected = detectPreset(anim);

    if (detected === null) {
      pushExportWarning(ctx, {
        code: 'animation-preset-unsupported',
        message: `animation on element "${anim.elementId}" cannot be mapped to a PowerPoint preset entrance effect; dropped per IO-D-16`,
        elementId: anim.elementId,
      });
      continue;
    }

    result.push({ elementId: anim.elementId, shapeId, ...detected });
  }

  return result;
}

interface DetectedPreset {
  readonly durationMs: number;
  readonly preset: MappableEntry['preset'];
  readonly direction?: FlyDirection;
}

/**
 * Detect which PowerPoint preset a Broadset animation maps to. Each
 * detector is a guard predicate over the timeline keyframes; the
 * first match wins. Order matters — fly-in checks before zoom because
 * an animation might combine translate + scale, and PowerPoint's
 * fly-in is the more specific preset.
 */
function detectPreset(anim: AnimationDefinition): DetectedPreset | null {
  const timeline = anim.config.timelines[0];

  if (timeline === undefined) return null;

  const keyframes = timeline.keyframes;

  if (keyframes.length < 2) return null;

  const start = keyframes[0];
  const end = keyframes[keyframes.length - 1];

  if (start === undefined || end === undefined) return null;

  const duration = end.offsetMs - start.offsetMs;

  if (duration <= 0 || duration > 5000) return null;

  const flyDirection = detectFlyInDirection(start, end);

  if (flyDirection !== null) return { durationMs: duration, preset: 'fly-in', direction: flyDirection };

  if (detectZoomIn(start, end)) return { durationMs: duration, preset: 'zoom' };

  if (detectFadeIn(start, end)) return { durationMs: duration, preset: 'fade' };

  if (detectWipe(start, end)) return { durationMs: duration, preset: 'wipe' };

  return null;
}

function detectFadeIn(start: Keyframe, end: Keyframe): boolean {
  const startOpacity = readNumberProp(start.properties, 'opacity');
  const endOpacity = readNumberProp(end.properties, 'opacity');

  if (startOpacity === null || endOpacity === null) return false;

  return startOpacity < 0.05 && endOpacity > 0.95;
}

/**
 * Fly-in: translateX or translateY animates from a non-zero offset to
 * zero. The sign of the start offset encodes the source edge —
 * positive translateX means "starts to the right of final position"
 * → fly from right; negative → fly from left. Same for Y.
 */
function detectFlyInDirection(start: Keyframe, end: Keyframe): FlyDirection | null {
  const startTx = readNumberProp(start.properties, 'translateX');
  const endTx = readNumberProp(end.properties, 'translateX');

  if (startTx !== null && endTx !== null && Math.abs(endTx) < 1 && Math.abs(startTx) >= 1) {
    return startTx > 0 ? 'right' : 'left';
  }

  const startTy = readNumberProp(start.properties, 'translateY');
  const endTy = readNumberProp(end.properties, 'translateY');

  if (startTy !== null && endTy !== null && Math.abs(endTy) < 1 && Math.abs(startTy) >= 1) {
    return startTy > 0 ? 'bottom' : 'top';
  }

  return null;
}

function detectZoomIn(start: Keyframe, end: Keyframe): boolean {
  const startScale = readNumberProp(start.properties, 'scale');
  const endScale = readNumberProp(end.properties, 'scale');

  if (startScale === null || endScale === null) return false;

  return startScale < 0.2 && Math.abs(endScale - 1) < 0.05;
}

/**
 * Wipe heuristic: a clip-rect or clip-path keyframe that goes from a
 * full-cover inset (one side fully clipped) to zero. We accept any
 * `clipInsetLeft` / `clipInsetTop` / etc. keyframe pair — Broadset's
 * exact prop name varies by author. The detection threshold is loose
 * because the visual is roughly equivalent across the four wipe
 * directions.
 */
function detectWipe(start: Keyframe, end: Keyframe): boolean {
  const props: readonly string[] = ['clipInsetLeft', 'clipInsetRight', 'clipInsetTop', 'clipInsetBottom'];

  for (const prop of props) {
    const a = readNumberProp(start.properties, prop);
    const b = readNumberProp(end.properties, prop);

    if (a !== null && b !== null && a > 0.5 && b < 0.05) return true;
  }

  return false;
}

function readNumberProp(properties: Readonly<Record<string, unknown>>, name: string): number | null {
  const value = properties[name];

  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const rawValue = record['value'];

  return typeof rawValue === 'number' ? rawValue : null;
}

function emitPresetEffect(entry: MappableEntry, baseId: number): string {
  const presetId = presetIdFor(entry);
  const presetSubtype = presetSubtypeFor(entry);

  if (entry.preset === 'fade') return emitFadeXml(entry, baseId, presetId);

  return emitTransformXml(entry, baseId, presetId, presetSubtype);
}

function presetIdFor(entry: MappableEntry): number {
  if (entry.preset === 'fade') return PRESET_FADE;
  if (entry.preset === 'fly-in') return PRESET_FLY_IN;
  if (entry.preset === 'zoom') return PRESET_ZOOM;

  return PRESET_WIPE;
}

function presetSubtypeFor(entry: MappableEntry): number {
  if (entry.preset !== 'fly-in') return 0;
  if (entry.direction === 'top') return FLY_FROM_TOP;
  if (entry.direction === 'right') return FLY_FROM_RIGHT;
  if (entry.direction === 'left') return FLY_FROM_LEFT;

  return FLY_FROM_BOTTOM;
}

/**
 * Emit the canonical PowerPoint Fade entrance — a `<p:set>` that
 * forces visibility on followed by an opacity-tween `<p:anim>`. This
 * is what PowerPoint's Animation Pane writes for "Fade" so the
 * imported animation surfaces as a first-class preset, not a custom
 * effect.
 */
function emitFadeXml(entry: MappableEntry, baseId: number, presetId: number): string {
  const spid = String(entry.shapeId);
  const dur = String(entry.durationMs);
  const id3 = String(baseId);
  const id4 = String(baseId + 1);
  const id5 = String(baseId + 2);
  const id6 = String(baseId + 3);
  const id7 = String(baseId + 4);

  return `<p:par><p:cTn id="${id3}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id4}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id5}" presetID="${String(presetId)}" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${id6}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${id7}" dur="${dur}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.opacity</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
}

/**
 * Emit the standard PowerPoint preset wrapper for fly-in / zoom /
 * wipe. PowerPoint's internal player keys off `presetID` +
 * `presetClass` + `presetSubtype` to look up the actual visual
 * effect; the inner `<p:set style.visibility>` is the minimum
 * preset-conforming body that opens cleanly in the Animation Pane.
 */
function emitTransformXml(entry: MappableEntry, baseId: number, presetId: number, presetSubtype: number): string {
  const spid = String(entry.shapeId);
  const id3 = String(baseId);
  const id4 = String(baseId + 1);
  const id5 = String(baseId + 2);
  const id6 = String(baseId + 3);

  return `<p:par><p:cTn id="${id3}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id4}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id5}" presetID="${String(presetId)}" presetClass="entr" presetSubtype="${String(presetSubtype)}" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${id6}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
}
