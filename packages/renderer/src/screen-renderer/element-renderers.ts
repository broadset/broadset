/**
 * Compatibility re-export shim. Per-type element renderers were moved into
 * `src/elements/` in Phase 3.1 of the renderer refactor. This file exists so
 * historical package-internal imports from `screen-renderer/element-renderers`
 * continue to resolve; new code should import from the package barrel or
 * directly from `src/elements/` internals.
 */

export { computeBooleanPath } from '../elements/_util/boolean-path';
export { createQrCodeMarkup } from '../elements/_util/qr-markup';
export { computeTrimPathAttributes } from '../elements/_util/trim-path';
export { createFallbackRenderer } from '../elements/fallback';
export { BUILT_IN_RENDERERS } from '../elements/registry';
