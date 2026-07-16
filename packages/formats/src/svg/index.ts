/**
 * SVG format barrel. Per the Phase 7 plan the public API is limited
 * to four symbols (`exportSvgString`, `exportSvgDocument`,
 * `importSvgDocument`, `canRoundTrip`) plus the typed option and
 * metadata surface. Internal modules (`import.ts`, `export.ts`) are
 * reachable only through this barrel; consumers MUST NOT import from
 * internal paths per the package-boundary rule in
 * `project/implementation/architecture.md` §3.3.
 */
export { canRoundTrip, type CanRoundTripResult } from './can-round-trip';
export { exportSvgDocument, exportSvgString, type SvgExportResult } from './export';
export { buildSvgAssetResolverFromAssets, buildSvgFontSourcesFromAssets } from './export-fonts';
export { importSvg, importSvgDocument, type SvgDocumentImportResult, type SvgImportResult } from './import';
export { dirtyElementIds, reconcileSvg, type ReconcileSvgInput } from './roundtrip';
export {
  type BroadsetRdfPacket,
  broadsetRdfPacketSchema,
  type BroadsetXmpPacket,
  type ElementTagAttrs,
  elementTagAttrsSchema,
  type FontEmbedChoice,
  fontEmbedChoiceSchema,
  SVG_BROADSET_NAMESPACE,
  type SvgExportOptions,
  svgExportOptionsSchema,
  type SvgExtensions,
  svgExtensionsSchema,
  type SvgFontSource,
  type SvgImportOptions,
  svgImportOptionsSchema,
  type SvgPreservedData,
  svgPreservedDataSchema,
  type SvgRoundTripMetadata,
  svgRoundTripMetadataSchema,
  type SvgSanitizationRemoval,
  type SvgSanitizationRemovalKind,
  type SvgSanitizationReport,
  svgSanitizationReportSchema,
  type UnitSystem,
  unitSystemSchema,
} from './types';
export { exportSvgStringV1, importSvgProjectV1 } from './v1';
