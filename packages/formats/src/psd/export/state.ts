interface LinkedFileEntry {
  readonly id: string;
  readonly name: string;
  readonly data: Uint8Array;
  readonly type: string;
}

interface ExportState {
  guidCounter: number;
  pendingLinkedFiles: LinkedFileEntry[];
  prefetchedUrlImages: Map<string, { readonly mime: string; readonly bytes: Uint8Array }>;
}

const exportState: ExportState = {
  guidCounter: 0,
  pendingLinkedFiles: [],
  prefetchedUrlImages: new Map(),
};

export function resetExportState(): void {
  exportState.guidCounter = 0;
  exportState.pendingLinkedFiles = [];
}

export function setPrefetchedUrlImages(
  images: Map<string, { readonly mime: string; readonly bytes: Uint8Array }>,
): void {
  exportState.prefetchedUrlImages = images;
}

export function getPendingLinkedFiles(): readonly LinkedFileEntry[] {
  return exportState.pendingLinkedFiles;
}

export function getPrefetchedUrlImages(): ReadonlyMap<string, { readonly mime: string; readonly bytes: Uint8Array }> {
  return exportState.prefetchedUrlImages;
}

export function pushPendingLinkedFile(entry: LinkedFileEntry): void {
  exportState.pendingLinkedFiles.push(entry);
}

function simpleHash(s: string): number {
  let hash = 0;

  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

export function elementIdToGuid(id: string): string {
  exportState.guidCounter++;

  const hex = exportState.guidCounter.toString(16).padStart(12, '0');
  const hash = simpleHash(id).toString(16).padStart(8, '0');

  return `${hash}-0000-4000-8000-${hex}`;
}
