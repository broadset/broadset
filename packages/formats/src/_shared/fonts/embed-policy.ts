import { type EmbedPermission } from './font-ops';

/**
 * Phase 4 `_shared/fonts/embed-policy.ts` — concrete embed policy
 * every format exporter (SVG `@font-face`, PDF font table, PPTX font
 * embed) and the Phase 5 preflight panel reads to decide whether to
 * embed, embed-with-warning, or refuse a font.
 *
 * Inputs are the coarse `EmbedPermission` bucket produced by
 * `readEmbedPermission()` (or `null` when the OS/2 table is missing).
 * Outputs are a Broadset-specific decision that carries the human
 * message preflight and the import-warnings modal surface unchanged.
 */

const WARNING_PREVIEW_PRINT =
  'Font is embedded under a preview/print-only license. Editing and copying are restricted at the recipient.';

const WARNING_UNKNOWN_PERMISSION =
  'Font lacks an OS/2 fsType table; defaulting to installable per OpenType spec but the permission could not be verified.';

const REASON_RESTRICTED =
  'Font vendor license forbids embedding (OS/2 fsType bit 1). Export will fall back to a reference without embedding.';

type EmbedAction = 'embed' | 'refuse';

interface EmbedDecision {
  readonly action: EmbedAction;
  readonly permission: EmbedPermission;
  readonly warning?: string | undefined;
  readonly reason?: string | undefined;
}

export function resolveEmbedDecision(permission: EmbedPermission | null): EmbedDecision {
  if (permission === 'restricted') {
    return { action: 'refuse', permission: 'restricted', reason: REASON_RESTRICTED };
  }

  if (permission === 'preview-print') {
    return { action: 'embed', permission: 'preview-print', warning: WARNING_PREVIEW_PRINT };
  }

  if (permission === null) {
    return { action: 'embed', permission: 'installable', warning: WARNING_UNKNOWN_PERMISSION };
  }

  // 'installable' | 'editable' — embed without warning.
  return { action: 'embed', permission };
}
