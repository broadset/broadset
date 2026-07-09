import { type BroadsetColor, parseColor } from '../broadset-color';

/**
 * Migrates a legacy string-typed color value to a `BroadsetColor`.
 *
 * Phase 1 unit #3 flips every color-valued field on `BroadsetElementStyle`
 * (`fill`, `stroke`, `fontColor`, `backgroundColor`, `borderColor`, gradient
 * stop colors) from `string` to `BroadsetColor`. This migrator is the single
 * conversion site called once by the document loader's initial validation
 * pass (unit #3c+) so no consumer is tempted to inline the conversion and
 * drift from the canonical rules.
 *
 * Behavior contract:
 *
 * - Absent inputs (`undefined`, `null`, empty / whitespace-only strings) map
 *   to `undefined`. Legacy fixtures use `color ?? ''` to represent "unset";
 *   preserving that shape keeps optional fields optional after migration.
 * - Any CSS color literal accepted by `parseColor` becomes an
 *   `RgbBroadsetColor`. Non-sRGB Color Level 4 literals (`oklch(...)`,
 *   `oklab(...)`, `color(display-p3 ...)`) additionally tag `space` and
 *   preserve the source syntax in `originalColor` for lossless round-trip
 *   per IO-D-05.
 * - Legacy strings can never encode a theme reference, so the migrator
 *   never emits `kind: 'theme'`. Theme references only enter the model
 *   through importers that know the source theme palette.
 * - Unparseable strings throw. Per IO-D-18 ("no silent drops") the document
 *   loader surfaces the failure as an import warning rather than swallowing
 *   a corrupt value with a neutral fallback.
 */
export function migrateLegacyColor(input: string | null | undefined): BroadsetColor | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  const trimmed = input.trim();

  if (trimmed === '') {
    return undefined;
  }

  return parseColor(trimmed);
}
