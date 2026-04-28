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
import {
  applyFirstSlideBackground,
  composeDocumentFromSlides,
  importSingleSlide,
} from './import/slide';
import { parseTheme } from './import/theme';
import { parseXml } from './ooxml/xml';
import {
  type OoxmlPackage,
  type OoxmlSkippedEntry,
  readOoxmlPackageWithCaps,
  readTextPart,
} from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import { parseLedgerXml } from './semantic/ledger';
import type { PptxImportOptions, PptxImportWarning } from './types';
import { BROADSET_CUSTOM_XML_INTEROP, BROADSET_CUSTOM_XML_PROJECT } from './types';

/**
 * Default caps per the Importer Security Contract in
 * `project/spec/formats/spec.md`. Defaults are exported so external
 * callers (demo's import bridge, programmatic CLI) can compose with
 * them without rebuilding the cap matrix.
 */
const DEFAULT_MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MiB
const DEFAULT_MAX_PART_BYTES = 50 * 1024 * 1024; // 50 MiB
const DEFAULT_MAX_ENTRIES = 4096;
/**
 * Cumulative uncompressed-bytes budget for the entire ZIP. Stops a
 * payload that fans out into many small entries (each within the
 * per-entry cap) but whose total inflates to gigabytes from exhausting
 * memory before the cap fires.
 */
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GiB

interface ResolvedPptxCaps {
  readonly maxInputBytes: number;
  readonly maxEntries: number;
  readonly maxPartBytes: number;
  readonly maxTotalUncompressedBytes: number;
}

function resolveCaps(options?: PptxImportOptions): ResolvedPptxCaps {
  return {
    maxInputBytes: options?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
    maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxPartBytes: options?.maxPartBytes ?? DEFAULT_MAX_PART_BYTES,
    maxTotalUncompressedBytes: DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
  };
}

function warningForSkippedEntry(entry: OoxmlSkippedEntry, caps: ResolvedPptxCaps): PptxImportWarning {
  switch (entry.reason) {
    case 'entry-cap':
      return {
        code: 'entry-cap',
        message: `Skipped entry "${entry.path}" — package exceeds entry-count cap of ${String(caps.maxEntries)} before decompression.`,
        detail: entry.path,
      };
    case 'size-cap':
      return {
        code: 'size-cap',
        message: `Skipped entry "${entry.path}" — declared uncompressed size ${String(entry.originalSize)} exceeds per-part cap ${String(caps.maxPartBytes)}.`,
        detail: entry.path,
      };
    case 'total-size-cap':
      return {
        code: 'size-cap',
        message: `Skipped entry "${entry.path}" — cumulative uncompressed size would exceed total cap ${String(caps.maxTotalUncompressedBytes)} bytes.`,
        detail: entry.path,
      };
  }
}

export function importPptx(data: Uint8Array, options?: PptxImportOptions): BroadsetDocument {
  return importPptxWithReport(data, options).document;
}

/**
 * Extended importer that returns the document alongside structured
 * import warnings (unsupported shapes / animations, rejected macros,
 * enforcement caps) and any embedded `ppt/fonts/` assets recovered
 * from the package.
 */
export interface PptxImportReport {
  readonly document: BroadsetDocument;
  readonly warnings: readonly PptxImportWarning[];
  readonly fontAssets: readonly FontAsset[];
}

export function importPptxWithReport(data: Uint8Array, options?: PptxImportOptions): PptxImportReport {
  const warnings: PptxImportWarning[] = [];
  const caps = resolveCaps(options);

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
      warnings.push(warningForSkippedEntry(skipped, caps));
    }
  } catch (err) {
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
  for (const [path] of pkg) {
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
    } catch (error) {
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
  const caps = resolveCaps(options);
  const { pkg } = readOoxmlPackageWithCaps(data, {
    maxEntries: caps.maxEntries,
    maxPartBytes: caps.maxPartBytes,
    maxTotalUncompressedBytes: caps.maxTotalUncompressedBytes,
  });
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
        ...((preservedEl.extensions['pptx']) ?? {}),
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
      pptx: { ...((el.extensions['pptx']) ?? {}), dirty: true },
    },
  };
}


/**
 * Reject PPTX macros (`vbaProject.bin`) and OLE embeddings at import
 * time per the Importer Security Contract.
 */
function rejectExecutionSurface(pkg: OoxmlPackage, warnings: PptxImportWarning[]): void {
  for (const [path] of pkg) {
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
  const slides: {
    readonly id: string;
    readonly notes?: string;
    readonly elements: readonly BroadsetDocument['elements'][number][];
  }[] = [];
  const allAnimations: AnimationDefinition[] = [];

  let elementCounter = 1;

  for (const [index, slidePath] of resolved.slidePaths.entries()) {
    const result = importSingleSlide(pkg, resolved, slidePath, index, theme, layoutPlaceholders, elementCounter);

    if (result === null) continue;

    elementCounter = result.nextElementCounter;
    slides.push(result.slide);

    for (const warning of result.warnings) {
      warnings.push(warning);
    }

    const slideXml = readTextPart(pkg, slidePath) ?? '';
    const timing = parseTimingAnimations(slideXml);

    for (const anim of timing.animations) {
      allAnimations.push(anim);
    }

    for (const warning of timing.warnings) {
      warnings.push({ code: warning.code, message: warning.message });
    }
  }

  const firstSlideXml = resolved.slidePaths[0] !== undefined ? readTextPart(pkg, resolved.slidePaths[0]) : null;
  const canvasWithBg = applyFirstSlideBackground(resolved.canvas, firstSlideXml);
  const doc = composeDocumentFromSlides(canvasWithBg, slides);

  return {
    document: allAnimations.length > 0 ? { ...doc, animations: allAnimations } : doc,
    warnings,
  };
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
