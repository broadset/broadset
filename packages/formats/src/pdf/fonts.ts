/**
 * Normalize font family name for deduplication.
 * Strips quotes, hyphens, trims, and lowercases.
 */
export function normalizeFontFamily(family: string): string {
  return family.replace(/['"]/g, '').replace(/-/g, '').trim().toLowerCase();
}

/**
 * Build a Google Fonts CSS URL for a given family name.
 */
export function resolveGoogleFontUrl(familyName: string): string {
  const encoded = encodeURIComponent(familyName);

  return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
}
