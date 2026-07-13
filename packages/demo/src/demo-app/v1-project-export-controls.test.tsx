import { createProjectEditorStore } from '@broadset/editor';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1ProjectExportControls } from './v1-project-export-controls';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Expected exported text'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read export'));
    };

    reader.readAsText(blob);
  });
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('Expected exported bytes'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read export'));
    };

    reader.readAsArrayBuffer(blob);
  });
}

const BINARY_EXPORTS: readonly {
  readonly label: string;
  readonly filename: string;
  readonly signature: readonly number[];
}[] = [
  { label: 'Export PDF', filename: 'broadset-page.pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { label: 'Export PSD', filename: 'broadset-document.psd', signature: [0x38, 0x42, 0x50, 0x53] },
  { label: 'Export PPTX', filename: 'broadset-document.pptx', signature: [0x50, 0x4b] },
];

describe('V1ProjectExportControls', () => {
  it('exports the active v1 page as standalone SVG', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const downloads: { readonly blob: Blob; readonly filename: string }[] = [];

    render(
      <V1ProjectExportControls
        editorStore={store}
        download={(blob, filename) => {
          downloads.push({ blob, filename });
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export SVG' }));

    await waitFor(
      () => {
        expect(downloads).toHaveLength(1);
      },
      { timeout: 10_000 },
    );

    const exported = downloads[0];

    if (exported === undefined) throw new Error('Expected SVG download');

    expect(exported.filename).toBe('broadset-page.svg');
    expect(await readBlobText(exported.blob)).toContain('<svg');
  });

  it.each(BINARY_EXPORTS)('produces a valid signature for $label', async ({ label, filename, signature }) => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const downloads: { readonly blob: Blob; readonly filename: string }[] = [];

    render(
      <V1ProjectExportControls
        editorStore={store}
        download={(blob, downloadedFilename) => {
          downloads.push({ blob, filename: downloadedFilename });
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(
      () => {
        expect(downloads).toHaveLength(1);
      },
      { timeout: 20_000 },
    );

    const exported = downloads[0];

    if (exported === undefined) throw new Error(`Expected ${label} download`);

    const bytes = await readBlobBytes(exported.blob);

    expect(exported.filename).toBe(filename);
    expect(Array.from(bytes.slice(0, signature.length))).toEqual(signature);
  });
});
