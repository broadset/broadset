import type { BroadsetColor } from '../broadset-color';
import {
  type BroadsetFill,
  gradientFill,
  noneFill,
  solidFill,
} from '../broadset-fill';
import type { BroadsetGradient } from '../style';

/**
 * Input shape for {@link migrateLegacyFill}. The legacy trio of
 * `fill` (SVG paint), `backgroundColor` (CSS container background), and
 * `backgroundGradient` (CSS gradient, structured or string) collapses
 * into a single {@link BroadsetFill} via this helper.
 *
 * `backgroundGradient` accepts the legacy `BackgroundGradientValue`
 * union shape — strings are rejected at runtime per the contract below
 * so downstream callers (8c Zod preprocessor, document loader) can pass
 * the unnormalized field through without pre-checking.
 */
export interface LegacyFillInput {
  readonly fill?: BroadsetColor | undefined;
  readonly backgroundColor?: BroadsetColor | undefined;
  readonly backgroundGradient?: BroadsetGradient | string | undefined;
}

/**
 * Migrates a legacy `{ fill, backgroundColor, backgroundGradient }` trio
 * on `BroadsetElementStyle` into a canonical {@link BroadsetFill}.
 *
 * Phase 1 unit #8 replaces the three flat fill-related style fields with
 * a single `fill: BroadsetFill`. This migrator is the one-site conversion
 * called by the document loader's initial validation pass (unit #8c+)
 * so no renderer / editor / formats / ui / demo consumer is tempted to
 * inline the priority logic and drift from the canonical rules.
 *
 * Precedence (highest → lowest):
 *
 *   1. Structured `backgroundGradient` → {@link gradientFill}.
 *   2. `fill` → {@link solidFill} (SVG-paint specificity wins over a
 *      coincident CSS-container `backgroundColor`).
 *   3. `backgroundColor` → {@link solidFill}.
 *   4. None of the above → {@link noneFill}.
 *
 * Other behaviors:
 *
 * - Legacy CSS-string `backgroundGradient` values (`"linear-gradient(...)"`)
 *   throw per IO-D-18 ("no silent drops"); the 8c field-type flip removes
 *   the string form entirely and fixtures carrying one must be migrated
 *   to a structured {@link BroadsetGradient} in the same commit.
 * - Empty / whitespace-only `backgroundGradient` strings are treated as
 *   absent so `value ?? ''` sentinels in old fixtures stay idempotent.
 * - Explicit `undefined` on any field is equivalent to the field being
 *   omitted, keeping the migrator call-site-safe.
 * - Theme references (`kind: 'theme'`) and non-sRGB `space` + `originalColor`
 *   preservation pass through unchanged so IO-D-05 round-trip guarantees
 *   survive migration.
 * - `pattern` and `picture` kinds are never emitted by the migrator —
 *   those fills reference asset-registry entries and only enter the model
 *   through importers that know the registry.
 */
export function migrateLegacyFill(input: LegacyFillInput): BroadsetFill {
  const gradientInput = input.backgroundGradient;

  if (gradientInput !== undefined) {
    if (typeof gradientInput === 'string') {
      if (gradientInput.trim() === '') {
        // Treat empty / whitespace-only strings as "unset" and fall through
        // to the next precedence rung rather than throwing.
      } else {
        throw new Error(
          `migrateLegacyFill: legacy CSS-string gradient ${JSON.stringify(
            gradientInput,
          )} is no longer supported; provide a structured BroadsetGradient instead.`,
        );
      }
    } else {
      return gradientFill(gradientInput);
    }
  }

  if (input.fill !== undefined) {
    return solidFill(input.fill);
  }

  if (input.backgroundColor !== undefined) {
    return solidFill(input.backgroundColor);
  }

  return noneFill();
}
