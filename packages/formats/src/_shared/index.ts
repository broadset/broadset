/**
 * Phase 2 `_shared/` barrel. Every cross-format utility module lives
 * under this directory; format code imports from `'./_shared'` rather
 * than reaching into submodule paths. Each module exposes a narrow
 * public API (four-to-six functions) per the io-prereqs plan.
 */
export * from './color';
export * from './fingerprint';
export * from './reconcile';
export * from './sanitize';
export * from './shape-classifier';
export * from './xmp';
