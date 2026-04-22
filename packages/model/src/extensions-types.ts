import { z } from 'zod';

/**
 * Per IO-D-11 (`project/implementation/decisions.md`) every value persisted
 * under an element's or document's `extensions.<formatId>` namespace must be
 * validated at load time against a Zod schema registered by the owning format
 * package. A `.bsp` file containing a stale shape — for example, a PSD
 * extension payload written by an older format version — fails loudly on
 * load instead of silently propagating into editor state.
 *
 * The model owns the registry mechanism + the four format-id reservations.
 * The format packages own their concrete schemas and call
 * `registerExtensionsSchema` from their respective `packages/formats/src/<id>/types.ts`
 * modules at import time.
 */
export type BroadsetFormatId = 'psd' | 'pdf' | 'pptx' | 'svg';

export const BROADSET_FORMAT_IDS = ['psd', 'pdf', 'pptx', 'svg'] as const satisfies readonly BroadsetFormatId[];

export const broadsetFormatIdSchema = z.enum(BROADSET_FORMAT_IDS);

/**
 * Every per-format extensions payload MUST carry a `dirty` flag. Importers
 * set it to `false` on hydrate; the editor middleware (unit #14) flips it
 * to `true` on any mutating action that touches the owning element. Format
 * exporters consult their own flag: dirty → re-emit from current Broadset
 * state; clean → re-emit the preserved original blob byte-for-byte.
 */
export interface BroadsetFormatExtensions {
  readonly dirty: boolean;
}

/** Base Zod fragment every per-format extensions schema MUST extend. */
export const broadsetFormatExtensionsBaseSchema = z.object({
  dirty: z.boolean(),
});

/**
 * Format-specific extension shapes are declared in the owning format
 * package. The interfaces below act as the model-side contract: every
 * concrete schema produced by a format package MUST extend
 * `BroadsetFormatExtensions`. Format packages augment these via
 * `declare module '@broadset/model'` so consumers see the narrowed shape.
 *
 * Until a format publishes its concrete shape, the namespace presence is
 * the only invariant the model can enforce, plus the universal `dirty`
 * flag.
 */
export interface PsdExtensions extends BroadsetFormatExtensions {}

export interface PdfExtensions extends BroadsetFormatExtensions {}

export interface PptxExtensions extends BroadsetFormatExtensions {}

export interface SvgExtensions extends BroadsetFormatExtensions {}

/** Typed view over the raw `extensions: Record<string, unknown>` field. */
export interface BroadsetExtensions {
  readonly psd?: PsdExtensions | undefined;
  readonly pdf?: PdfExtensions | undefined;
  readonly pptx?: PptxExtensions | undefined;
  readonly svg?: SvgExtensions | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────────

type RegisteredSchema = z.ZodType<BroadsetFormatExtensions>;

const extensionsRegistry = new Map<BroadsetFormatId, RegisteredSchema>();

/**
 * Registers (or replaces) the Zod schema validating
 * `extensions.<formatId>` payloads. Format packages call this once at
 * import time. The schema MUST extend `broadsetFormatExtensionsBaseSchema`
 * so the universal `dirty` invariant is enforced.
 */
export function registerExtensionsSchema(formatId: BroadsetFormatId, schema: RegisteredSchema): void {
  extensionsRegistry.set(formatId, schema);
}

/**
 * Returns the registered schema for a format, or `undefined` when no format
 * package has registered yet. Callers SHOULD treat `undefined` as "skip
 * validation, accept any shape" — forward-compat for older deployments
 * that haven't loaded the owning format package.
 */
export function getExtensionsSchema(formatId: BroadsetFormatId): RegisteredSchema | undefined {
  return extensionsRegistry.get(formatId);
}

/** Removes a registration. Used by tests to isolate registry state. */
export function unregisterExtensionsSchema(formatId: BroadsetFormatId): void {
  extensionsRegistry.delete(formatId);
}

/** Returns the set of currently registered format ids. */
export function listRegisteredExtensionsFormats(): readonly BroadsetFormatId[] {
  return [...extensionsRegistry.keys()];
}

/**
 * Validates a raw `extensions` record against every registered schema.
 * Returns a typed `BroadsetExtensions` view. Per IO-D-11 this throws via
 * Zod when a registered schema rejects the persisted shape — a stale
 * `.bsp` is a hard load error, not a silent recovery.
 *
 * Unknown namespaces (no registered schema) pass through as `unknown` and
 * are preserved on the raw record by the caller.
 */
export function validateExtensions(raw: Readonly<Record<string, unknown>>): BroadsetExtensions {
  const result: Record<string, BroadsetFormatExtensions> = {};

  for (const formatId of BROADSET_FORMAT_IDS) {
    const value = raw[formatId];

    if (value === undefined) {
      continue;
    }

    const schema = extensionsRegistry.get(formatId);

    if (schema === undefined) {
      // Forward-compat: accept the namespace presence even when its owning
      // format package has not registered yet. The raw value is preserved
      // by the document/element Zod transform; this function only narrows
      // what it can.
      continue;
    }

    result[formatId] = schema.parse(value);
  }

  return result as BroadsetExtensions;
}

/**
 * Helper for callers that own a Zod `superRefine` context and need the
 * registry's load-time validation surfaced as discriminated path-aware
 * issues rather than a thrown exception. Used by element.ts and
 * document.ts to enforce IO-D-11 inside their existing validation chains
 * without raising the surrounding cognitive complexity.
 *
 * Issue paths are prefixed with `['extensions', <formatId>, ...]` so
 * downstream tooling can pinpoint which namespace's payload failed.
 */
export function refineExtensionsAgainstRegistry(
  raw: Readonly<Record<string, unknown>> | undefined,
  context: z.RefinementCtx,
): void {
  if (raw === undefined) {
    return;
  }

  for (const formatId of BROADSET_FORMAT_IDS) {
    const value = raw[formatId];

    if (value === undefined) {
      continue;
    }

    const schema = extensionsRegistry.get(formatId);

    if (schema === undefined) {
      continue;
    }

    const result = schema.safeParse(value);

    if (result.success) {
      continue;
    }

    for (const issue of result.error.issues) {
      context.addIssue({
        ...issue,
        path: ['extensions', formatId, ...issue.path],
      });
    }
  }
}

/**
 * Convenience accessor: extract a typed extensions namespace from a raw
 * record. Returns `undefined` when the namespace is absent. Throws when
 * the namespace is present and a schema is registered but validation
 * fails — same fail-loudly contract as `validateExtensions`.
 */
export function getExtensions<F extends BroadsetFormatId>(
  raw: Readonly<Record<string, unknown>>,
  formatId: F,
): BroadsetExtensionsByFormat[F] | undefined {
  const value = raw[formatId];

  if (value === undefined) {
    return undefined;
  }

  const schema = extensionsRegistry.get(formatId);

  if (schema === undefined) {
    return value as BroadsetExtensionsByFormat[F];
  }

  return schema.parse(value) as BroadsetExtensionsByFormat[F];
}

/** Maps each format id to its concrete extensions interface. */
export interface BroadsetExtensionsByFormat {
  readonly psd: PsdExtensions;
  readonly pdf: PdfExtensions;
  readonly pptx: PptxExtensions;
  readonly svg: SvgExtensions;
}
