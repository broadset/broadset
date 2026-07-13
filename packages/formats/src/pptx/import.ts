import {
  type AnimationDefinition,
  type BroadsetDocument,
  createEmptyBroadsetDocument,
  ensureRootElementsHavePageInstances,
  type FontAsset,
} from '@broadset/model';

import { fingerprintElement } from '../_shared';
import { parseTimingAnimations } from './import/animation';
import { extractEmbeddedFonts } from './import/fonts';
import { aggregateLayoutPlaceholders } from './import/layout';
import { resolvePackage } from './import/package';
import { applyFirstSlideBackground, composeDocumentFromSlides, importSingleSlide } from './import/slide';
import { parseTheme } from './import/theme';
import { resolvePptxImportCaps, warningForSkippedOoxmlEntry } from './import-caps';
import { parseXml } from './ooxml/xml';
import { type OoxmlPackage, readOoxmlPackageWithCaps, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import { parseLedgerXml } from './semantic/ledger';
import type { PptxImportOptions, PptxImportWarning } from './types';
import { BROADSET_CUSTOM_XML_INTEROP, BROADSET_CUSTOM_XML_PROJECT } from './types';

export function importPptx(data: Uint8Array, options?: PptxImportOptions): BroadsetDocument {
  return importPptxWithReport(data, options).document;
}

/**
 * Extended importer that returns the document alongside structured
 * import warnings (unsupported shapes / animations, rejected macros,
 * enforcement caps) and any embedded `ppt/fonts/` assets recovered
 * from the package.
 */
interface PptxImportReport {
  readonly document: BroadsetDocument;
  readonly warnings: readonly PptxImportWarning[];
  readonly fontAssets: readonly FontAsset[];
}

export function importPptxWithReport(data: Uint8Array, options?: PptxImportOptions): PptxImportReport {
  const warnings: PptxImportWarning[] = [];
  const caps = resolvePptxImportCaps(options);

  if (data.byteLength > caps.maxInputBytes) {
    warnings.push({
      code: 'size-cap',
      message: `Input size ${String(data.byteLength)} exceeds cap ${String(caps.maxInputBytes)} bytes`,
    });

    return { document: createEmptyBroadsetDocument(), warnings, fontAssets: [] };
  }

  let pkg: OoxmlPackage;

  try {
    const result = readOoxmlPackageWithCaps(data, {
      maxEntries: caps.maxEntries,
      maxPartBytes: caps.maxPartBytes,
      maxTotalUncompressedBytes: caps.maxTotalUncompressedBytes,
    });

    pkg = result.pkg;

    for (const skipped of result.skippedEntries) {
      warnings.push(warningForSkippedOoxmlEntry(skipped, caps));
    }
  } catch (err: unknown) {
    warnings.push({
      code: 'malformed-xml',
      message: 'PPTX package is not a readable ZIP archive — import rejected.',
      detail: err instanceof Error ? err.message : 'unknown ZIP error',
    });

    return { document: createEmptyBroadsetDocument(), warnings, fontAssets: [] };
  }

  rejectExecutionSurface(pkg, warnings);

  // Security floor: route every XML / rels part through fast-xml-parser.
  const xmlIssue = validateXmlSafety(pkg);

  if (xmlIssue !== null) {
    warnings.push(xmlIssue);

    return { document: createEmptyBroadsetDocument(), warnings, fontAssets: [] };
  }

  const fontAssets = extractEmbeddedFonts(pkg);
  const fastPathResult = tryFastPath(pkg);

  if (fastPathResult !== null)
    return { document: ensureRootElementsHavePageInstances(fastPathResult), warnings, fontAssets };

  const operatorLevel = importOperatorLevel(pkg);

  return {
    document: ensureRootElementsHavePageInstances(operatorLevel.document),
    warnings: [...warnings, ...operatorLevel.warnings],
    fontAssets,
  };
}

/**
 * Security floor for XML parts.
 *
 * 1. Any `<!DOCTYPE>` declaration rejects the import.
 * 2. `parseXml` succeeds for each XML / rels part.
 */
function validateXmlSafety(pkg: OoxmlPackage): PptxImportWarning | null {
  for (const path of packagePaths(pkg)) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;

    const text = readTextPart(pkg, path);

    if (text === null || text.trim().length === 0) continue;

    if (/<!\s*DOCTYPE\b/i.test(text)) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" contains a DOCTYPE declaration; suspected XXE / billion-laughs payload, import rejected`,
        detail: 'DOCTYPE declarations are not used by Office-authored OOXML',
      };
    }

    if (/<!\s*(?:ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i.test(text)) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" contains a standalone DTD construct; rejected`,
        detail: 'DTD-style declarations are not used by Office-authored OOXML',
      };
    }

    try {
      parseXml(text);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'parse failure';

      return {
        code: 'malformed-xml',
        message: `XML part "${path}" failed to parse and was rejected`,
        detail,
      };
    }
  }

  return null;
}

/**
 * Async importer that merges external edits into the fast-path output.
 */
export async function importPptxWithMerge(data: Uint8Array, options?: PptxImportOptions): Promise<PptxImportReport> {
  const baseReport = importPptxWithReport(data, options);
  const caps = resolvePptxImportCaps(options);
  let pkg: OoxmlPackage;

  if (data.byteLength > caps.maxInputBytes) return baseReport;

  try {
    const result = readOoxmlPackageWithCaps(data, {
      maxEntries: caps.maxEntries,
      maxPartBytes: caps.maxPartBytes,
      maxTotalUncompressedBytes: caps.maxTotalUncompressedBytes,
    });

    pkg = result.pkg;
  } catch {
    return baseReport;
  }

  const preservedXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);

  if (preservedXml === null) return baseReport;

  const preserved = parseProjectCustomXml(preservedXml);

  if (!isDocumentShape(preserved)) return baseReport;

  // Re-run operator-level extraction so we have both representations.
  const operatorLevel = importOperatorLevel(pkg, preserved.canvas);
  const ledger = readLedgerEntries(pkg);
  const merged = await mergeFromLedger(preserved, operatorLevel.document, ledger);

  return {
    document: ensureRootElementsHavePageInstances(merged),
    warnings: baseReport.warnings,
    fontAssets: baseReport.fontAssets,
  };
}

function readLedgerEntries(pkg: OoxmlPackage): ReadonlyMap<string, string> {
  const ledgerXml = readTextPart(pkg, BROADSET_CUSTOM_XML_INTEROP);
  const map = new Map<string, string>();

  if (ledgerXml === null) return map;

  const ledger = parseLedgerXml(ledgerXml);

  if (ledger === null) return map;

  for (const entry of ledger.entries) {
    map.set(entry.elementId, entry.fingerprint);
  }

  return map;
}

async function mergeFromLedger(
  preserved: BroadsetDocument,
  current: BroadsetDocument,
  ledger: ReadonlyMap<string, string>,
): Promise<BroadsetDocument> {
  const currentById = new Map<string, BroadsetDocument['elements'][number]>();

  for (const el of current.elements) {
    currentById.set(el.id, el);
  }

  const merged: BroadsetDocument['elements'][number][] = [];

  for (const preservedEl of preserved.elements) {
    merged.push(await pickPreservedOrEdited(preservedEl, currentById.get(preservedEl.id), ledger));
  }

  for (const currentEl of current.elements) {
    if (!preserved.elements.some((p) => p.id === currentEl.id)) {
      merged.push(markDirty(currentEl));
    }
  }

  return { ...preserved, elements: merged };
}

async function pickPreservedOrEdited(
  preservedEl: BroadsetDocument['elements'][number],
  currentEl: BroadsetDocument['elements'][number] | undefined,
  ledger: ReadonlyMap<string, string>,
): Promise<BroadsetDocument['elements'][number]> {
  if (currentEl === undefined) return preservedEl;

  const ledgerHash = ledger.get(preservedEl.id);
  const currentHash = await fingerprintElement(currentEl);

  if (ledgerHash !== undefined && ledgerHash === currentHash) return preservedEl;

  return mergeEdited(preservedEl, currentEl);
}

function mergeEdited(
  preservedEl: BroadsetDocument['elements'][number],
  currentEl: BroadsetDocument['elements'][number],
): BroadsetDocument['elements'][number] {
  return {
    ...currentEl,
    ...(preservedEl.dataField !== null ? { dataField: preservedEl.dataField } : {}),
    ...(preservedEl.visibleWhen !== null ? { visibleWhen: preservedEl.visibleWhen } : {}),
    ...(preservedEl.repeater !== null ? { repeater: preservedEl.repeater } : {}),
    extensions: {
      ...preservedEl.extensions,
      pptx: {
        ...(preservedEl.extensions['pptx'] ?? {}),
        dirty: true,
      },
    },
  };
}

function markDirty(el: BroadsetDocument['elements'][number]): BroadsetDocument['elements'][number] {
  return {
    ...el,
    extensions: {
      ...el.extensions,
      pptx: { ...(el.extensions['pptx'] ?? {}), dirty: true },
    },
  };
}

/**
 * Reject PPTX macros (`vbaProject.bin`) and OLE embeddings at import
 * time per the Importer Security Contract.
 */
function rejectExecutionSurface(pkg: OoxmlPackage, warnings: PptxImportWarning[]): void {
  for (const path of packagePaths(pkg)) {
    if (path === 'ppt/vbaProject.bin') {
      warnings.push({
        code: 'macro-rejected',
        message: 'PPTX contains vbaProject.bin — macros have been stripped from the import',
        detail: path,
      });
    }

    if (path.startsWith('ppt/embeddings/') && path.endsWith('.bin')) {
      warnings.push({
        code: 'ole-rejected',
        message: `OLE embedding ${path} has been stripped from the import`,
        detail: path,
      });
    }
  }
}

function tryFastPath(pkg: OoxmlPackage): BroadsetDocument | null {
  const projectXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);
  const fastPath = projectXml !== null ? parseProjectCustomXml(projectXml) : null;

  return isDocumentShape(fastPath) ? fastPath : null;
}

interface OperatorLevelResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly PptxImportWarning[];
}

type OperatorResolvedPackage = Parameters<typeof importSingleSlide>[1];
type OperatorTheme = Parameters<typeof importSingleSlide>[4];
type OperatorLayoutPlaceholders = Parameters<typeof importSingleSlide>[5];

interface OperatorSlide {
  readonly id: string;
  readonly notes?: string;
  readonly elements: readonly BroadsetDocument['elements'][number][];
}

function importOperatorLevel(pkg: OoxmlPackage, canvasOverride?: BroadsetDocument['canvas']): OperatorLevelResult {
  const baseResolved = resolvePackage(pkg);
  const resolved = canvasOverride !== undefined ? { ...baseResolved, canvas: canvasOverride } : baseResolved;
  const warnings: PptxImportWarning[] = [];

  if (resolved.slidePaths.length === 0) {
    warnings.push({
      code: 'unsupported-content',
      message: 'PPTX package contains no slide parts — nothing to import.',
    });

    return { document: createEmptyBroadsetDocument(), warnings };
  }

  const themeXml = resolved.themePath !== null ? readTextPart(pkg, resolved.themePath) : null;
  const theme = parseTheme(themeXml);
  const layoutPlaceholders = aggregateLayoutPlaceholders(pkg, resolved.layoutPaths, theme);
  const slides: OperatorSlide[] = [];
  const allAnimations: AnimationDefinition[] = [];

  let elementCounter = 1;

  for (let index = 0; index < resolved.slidePaths.length; index += 1) {
    const slidePath = resolved.slidePaths[index];

    if (slidePath === undefined) continue;

    elementCounter = importOperatorSlide({
      pkg,
      resolved,
      slidePath,
      index,
      theme,
      layoutPlaceholders,
      elementCounter,
      slides,
      allAnimations,
      warnings,
    });
  }

  const firstSlideXml = resolved.slidePaths[0] !== undefined ? readTextPart(pkg, resolved.slidePaths[0]) : null;
  const canvasWithBg = applyFirstSlideBackground(resolved.canvas, firstSlideXml);
  const doc = composeDocumentFromSlides(canvasWithBg, slides);

  return {
    document: allAnimations.length > 0 ? { ...doc, animations: allAnimations } : doc,
    warnings,
  };
}

function importOperatorSlide(args: {
  readonly pkg: OoxmlPackage;
  readonly resolved: OperatorResolvedPackage;
  readonly slidePath: string;
  readonly index: number;
  readonly theme: OperatorTheme;
  readonly layoutPlaceholders: OperatorLayoutPlaceholders;
  readonly elementCounter: number;
  readonly slides: OperatorSlide[];
  readonly allAnimations: AnimationDefinition[];
  readonly warnings: PptxImportWarning[];
}): number {
  const result = importSingleSlide(
    args.pkg,
    args.resolved,
    args.slidePath,
    args.index,
    args.theme,
    args.layoutPlaceholders,
    args.elementCounter,
  );

  if (result === null) return args.elementCounter;

  args.slides.push(result.slide);
  appendPptxWarnings(args.warnings, result.warnings);
  appendSlideTiming(args.pkg, args.slidePath, args.allAnimations, args.warnings);

  return result.nextElementCounter;
}

function appendPptxWarnings(target: PptxImportWarning[], source: readonly PptxImportWarning[]): void {
  for (const warning of source) {
    target.push(warning);
  }
}

function appendSlideTiming(
  pkg: OoxmlPackage,
  slidePath: string,
  allAnimations: AnimationDefinition[],
  warnings: PptxImportWarning[],
): void {
  const slideXml = readTextPart(pkg, slidePath) ?? '';
  const timing = parseTimingAnimations(slideXml);

  for (const anim of timing.animations) {
    allAnimations.push(anim);
  }

  for (const warning of timing.warnings) {
    warnings.push({ code: warning.code, message: warning.message });
  }
}

function packagePaths(pkg: OoxmlPackage): readonly string[] {
  return Array.from(pkg.keys());
}

function isDocumentShape(value: unknown): value is BroadsetDocument {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record['id'] === 'string' &&
    Array.isArray(record['elements']) &&
    Array.isArray(record['pages']) &&
    typeof record['canvas'] === 'object' &&
    record['canvas'] !== null
  );
}
