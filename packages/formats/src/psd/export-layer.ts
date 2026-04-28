// Re-export shim — implementation lives in `./export/`. The tests and
// `./export.ts` import from this module; keeping the shim avoids a
// flag-day rename across every test file.
export { elementToLayer } from './export/layer';
export { getPendingLinkedFiles, resetExportState, setPrefetchedUrlImages } from './export/state';
export { composeTextFromBody, isTextBody } from './export/text';
