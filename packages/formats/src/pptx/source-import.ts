import { containsForbiddenXmlDeclaration } from '../_shared/import-limits';
import { extractEmbeddedFonts } from './import/fonts';
import { aggregateLayoutPlaceholders } from './import/layout';
import { resolvePackage } from './import/package';
import { applyFirstSlideBackground, composeDocumentFromSlides, importSingleSlide } from './import/slide';
import { parseTheme } from './import/theme';
import { resolvePptxImportCaps, warningForSkippedOoxmlEntry } from './import-caps';
import { parseXml } from './ooxml/xml';
import { type OoxmlPackage, readOoxmlPackageWithCaps, readTextPart } from './ooxml/zip';
import {
  createEmptyPptxSourceDocument,
  type PptxEmbeddedFontAsset,
  type PptxSourceDocument,
  type PptxSourceElement,
} from './project-model';
import type { PptxImportOptions, PptxImportWarning } from './types';

export interface PptxSourceImportReport {
  readonly document: PptxSourceDocument;
  readonly warnings: readonly PptxImportWarning[];
  readonly fontAssets: readonly PptxEmbeddedFontAsset[];
  readonly terminalTrustBoundaryWarning?: PptxImportWarning;
}

export function importPptxSource(data: Uint8Array, options?: PptxImportOptions): PptxSourceDocument {
  return importPptxSourceWithReport(data, options).document;
}

export function importPptxSourceWithReport(data: Uint8Array, options?: PptxImportOptions): PptxSourceImportReport {
  const warnings: PptxImportWarning[] = [];
  const caps = resolvePptxImportCaps(options);

  if (data.byteLength > caps.maxInputBytes) {
    warnings.push({
      code: 'size-cap',
      message: `Input size ${String(data.byteLength)} exceeds cap ${String(caps.maxInputBytes)} bytes`,
    });

    return { document: createEmptyPptxSourceDocument(), warnings, fontAssets: [] };
  }

  try {
    const result = readOoxmlPackageWithCaps(data, {
      maxInputBytes: caps.maxInputBytes,
      maxEntries: caps.maxEntries,
      maxPartBytes: caps.maxPartBytes,
      maxTotalUncompressedBytes: caps.maxTotalUncompressedBytes,
      maxExpansionRatio: caps.maxExpansionRatio,
      maxDepth: caps.maxDepth,
    });

    warnings.push(...result.skippedEntries.map((entry) => warningForSkippedOoxmlEntry(entry, caps)));

    return importPptxPackageWithReport({ pkg: result.pkg, options, archiveWarnings: warnings });
  } catch (error: unknown) {
    warnings.push({
      code: 'malformed-xml',
      message: 'PPTX package is not a readable ZIP archive — import rejected.',
      detail: error instanceof Error ? error.message : 'unknown ZIP error',
    });

    return { document: createEmptyPptxSourceDocument(), warnings, fontAssets: [] };
  }
}

export function importPptxPackageWithReport(input: {
  readonly pkg: OoxmlPackage;
  readonly options: PptxImportOptions | undefined;
  readonly archiveWarnings: readonly PptxImportWarning[];
}): PptxSourceImportReport {
  const warnings = [...input.archiveWarnings];

  rejectExecutionSurface(input.pkg, warnings);

  const xmlIssue = validateXmlSafety(input.pkg);

  if (xmlIssue !== null) {
    warnings.push(xmlIssue);

    return {
      document: createEmptyPptxSourceDocument(),
      warnings,
      fontAssets: [],
      terminalTrustBoundaryWarning: xmlIssue,
    };
  }

  const fontAssets = extractEmbeddedFonts(input.pkg);
  const operatorLevel = importOperatorLevel(input.pkg, input.options?.authoredSurface);

  return { document: operatorLevel.document, warnings: [...warnings, ...operatorLevel.warnings], fontAssets };
}

function validateXmlSafety(pkg: OoxmlPackage): PptxImportWarning | null {
  const paths: readonly string[] = [...pkg.keys()];

  for (const path of paths) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;

    const source = readTextPart(pkg, path);

    if (source === null || source.trim().length === 0) continue;

    if (containsForbiddenXmlDeclaration(source)) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" contains a DTD construct and was rejected.`,
        detail: 'DTD declarations are not used by Office-authored OOXML.',
      };
    }

    try {
      parseXml(source);
    } catch (error: unknown) {
      return {
        code: 'malformed-xml',
        message: `XML part "${path}" failed to parse and was rejected.`,
        detail: error instanceof Error ? error.message : 'parse failure',
      };
    }
  }

  return null;
}

function rejectExecutionSurface(pkg: OoxmlPackage, warnings: PptxImportWarning[]): void {
  const paths: readonly string[] = [...pkg.keys()];

  for (const path of paths) {
    if (path === 'ppt/vbaProject.bin') {
      warnings.push({
        code: 'macro-rejected',
        message: 'PPTX contains vbaProject.bin — macros have been stripped from the import.',
        detail: path,
      });
    }

    if (path.startsWith('ppt/embeddings/') && path.endsWith('.bin')) {
      warnings.push({
        code: 'ole-rejected',
        message: `OLE embedding ${path} has been stripped from the import.`,
        detail: path,
      });
    }
  }
}

interface OperatorLevelResult {
  readonly document: PptxSourceDocument;
  readonly warnings: readonly PptxImportWarning[];
}

interface OperatorSlide {
  readonly id: string;
  readonly notes?: string;
  readonly elements: readonly PptxSourceElement[];
}

function importOperatorLevel(
  pkg: OoxmlPackage,
  authoredSurface?: PptxImportOptions['authoredSurface'],
): OperatorLevelResult {
  const resolved = {
    ...resolvePackage(pkg, authoredSurface),
    dataUriByMediaPath: new Map<string, string>(),
  };
  const warnings: PptxImportWarning[] = [];

  if (resolved.slidePaths.length === 0) {
    warnings.push({ code: 'unsupported-content', message: 'PPTX package contains no slide parts.' });

    return { document: createEmptyPptxSourceDocument(), warnings };
  }

  const themeXml = resolved.themePath === null ? null : readTextPart(pkg, resolved.themePath);
  const theme = parseTheme(themeXml);
  const layoutPlaceholders = aggregateLayoutPlaceholders(pkg, resolved.layoutPaths, theme);
  const slides: OperatorSlide[] = [];
  let elementCounter = 1;

  for (let index = 0; index < resolved.slidePaths.length; index += 1) {
    const slidePath = resolved.slidePaths[index];

    if (slidePath === undefined) continue;

    const result = importSingleSlide(pkg, resolved, slidePath, index, theme, layoutPlaceholders, elementCounter);

    if (result === null) continue;

    slides.push(result.slide);
    warnings.push(...result.warnings);
    elementCounter = result.nextElementCounter;
  }

  const firstSlideXml = resolved.slidePaths[0] === undefined ? null : readTextPart(pkg, resolved.slidePaths[0]);
  const canvas = applyFirstSlideBackground(resolved.canvas, firstSlideXml);

  return { document: composeDocumentFromSlides(canvas, slides), warnings };
}
