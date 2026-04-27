export interface UnsupportedShapeInfo {
  readonly label: string;
  readonly detail?: string;
}

export function classifyTableGraphicFrame(uri: string | undefined): UnsupportedShapeInfo | null {
  if (uri?.endsWith('/table')) {
    return { label: 'OOXML table (<a:tbl>)', detail: uri };
  }

  return null;
}
