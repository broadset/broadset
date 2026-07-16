export function psdLayerName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();

  return trimmed === undefined || trimmed === '' ? fallback : trimmed;
}
