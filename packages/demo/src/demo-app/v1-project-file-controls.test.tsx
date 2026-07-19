import { createProjectEditorStore } from '@broadset/editor';
import { BSP_PROJECT_MIME_V1, exportBspPackageV1, loadBspPackageV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1ProjectFileControls } from './v1-project-file-controls';

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('Expected binary file contents'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read exported package'));
    };

    reader.readAsArrayBuffer(blob);
  });
}

describe('V1ProjectFileControls', () => {
  it('rejects an oversized BSP before reading it into browser memory', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const file = new File([], 'oversized.bsp', { type: BSP_PROJECT_MIME_V1 });
    const read = vi.spyOn(file, 'arrayBuffer');

    Object.defineProperty(file, 'size', { value: 256 * 1024 * 1024 + 1 });
    render(<V1ProjectFileControls editorStore={store} />);

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('256 MiB');
    });

    expect(read).not.toHaveBeenCalled();
    expect(store.getState().project).toBe(SAMPLE_PROJECT_V1);
  });

  it('rejects external interchange files in the native-only host', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1ProjectFileControls editorStore={store} />);

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect id="box" width="100" height="50" fill="#f00"/></svg>';

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: { files: [new File([svg], 'external.svg', { type: 'image/svg+xml' })] },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Unsupported project file type');
    });

    expect(store.getState().project).toBe(SAMPLE_PROJECT_V1);
  });

  it('retains the last valid v1 project when an invalid file is quarantined', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const onProjectQuarantined = vi.fn<(bytes: Uint8Array) => void>();

    render(<V1ProjectFileControls editorStore={store} onProjectQuarantined={onProjectQuarantined} />);

    const invalidBytes = new TextEncoder().encode('{}');

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: { files: [new File([invalidBytes], 'invalid.bsp', { type: BSP_PROJECT_MIME_V1 })] },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('ZIP');
    });

    expect(store.getState().project).toBe(SAMPLE_PROJECT_V1);

    const quarantinedBytes = onProjectQuarantined.mock.calls[0]?.[0];

    expect(Array.from(quarantinedBytes ?? [])).toEqual(Array.from(invalidBytes));
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('passes malformed project file bytes to the loader without replacement decoding', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const onProjectQuarantined = vi.fn<(bytes: Uint8Array) => void>();

    render(<V1ProjectFileControls editorStore={store} onProjectQuarantined={onProjectQuarantined} />);

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: {
        files: [
          new File([Uint8Array.of(0x80)], 'invalid-utf8.broadset.json', {
            type: 'application/vnd.broadset.project+json',
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('valid UTF-8');
    });

    expect(store.getState().project).toBe(SAMPLE_PROJECT_V1);
    expect(onProjectQuarantined).toHaveBeenCalledExactlyOnceWith(Uint8Array.of(0x80));
  });

  it('loads raw canonical JSON separately and saves a valid BSP package', async () => {
    const staleDigest = SAMPLE_PROJECT_V1.resources.assets[0]?.blob.digest;

    if (staleDigest === undefined) throw new Error('Expected sample asset digest');

    const store = createProjectEditorStore({
      project: SAMPLE_PROJECT_V1,
      blobs: new Map([[staleDigest, Uint8Array.of(9, 9, 9)]]),
    });
    const downloads: { readonly blob: Blob; readonly filename: string }[] = [];
    const importedProject = projectFormatV1.createProjectV1({ name: 'Imported v1 project' });

    render(
      <V1ProjectFileControls
        editorStore={store}
        download={(blob, filename) => {
          downloads.push({ blob, filename });
        }}
      />,
    );

    const file = new File([projectFormatV1.canonicalizeProjectV1(importedProject)], 'project.broadset.json', {
      type: 'application/vnd.broadset.project+json',
    });

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), { target: { files: [file] } });

    await waitFor(() => {
      expect(store.getState().project.metadata.name).toBe('Imported v1 project');
    });

    expect(store.getState().blobs.size).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Save .bsp' }));

    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });

    const call = downloads[0];

    if (call === undefined) throw new Error('Expected a project download');

    const { blob, filename } = call;
    const exportedBytes = await readBlobBytes(blob);
    const loaded = await loadBspPackageV1(exportedBytes);

    expect(filename).toBe('broadset-project.bsp');
    expect(blob.type).toBe(BSP_PROJECT_MIME_V1);
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') throw new Error('Expected valid exported BSP package');
    expect(projectFormatV1.canonicalizeProjectV1(loaded.project)).toBe(
      projectFormatV1.canonicalizeProjectV1(importedProject),
    );
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(loaded.project)).toEqual([]);
  });

  it('does not download when BSP export rejects missing package blobs', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const download = vi.fn<(blob: Blob, filename: string) => void>();

    render(<V1ProjectFileControls editorStore={store} download={download} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save .bsp' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Missing blob bytes');
    });

    expect(download).not.toHaveBeenCalled();
  });

  it('opens a BSP package through its manifest and integrity checks', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const bytes = Uint8Array.of(1, 2, 3);
    const digest = projectFormatV1.sha256DigestSchema.parse(
      'sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    );
    const project = projectFormatV1.createProjectV1({ name: 'Packaged project' });
    const importedProject: projectFormatV1.BroadsetProjectV1 = {
      ...project,
      resources: {
        ...project.resources,
        assets: [
          {
            id: projectFormatV1.idSchema.parse('fixture-image'),
            kind: 'image',
            name: 'Fixture',
            blob: {
              byteLength: bytes.byteLength,
              digest,
              mediaType: 'image/png',
              source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
            },
            metadata: {
              bitDepth: 8,
              colorModel: 'rgb',
              hasAlpha: false,
              orientation: 1,
              pixelHeight: 1,
              pixelWidth: 1,
            },
          },
        ],
      },
    };
    const blobs = new Map([[digest, bytes]]);
    const exported = await exportBspPackageV1({ project: importedProject, blobs });

    if (exported.status !== 'exported') throw new Error('Expected package fixture export');

    render(<V1ProjectFileControls editorStore={store} />);

    fireEvent.change(screen.getByLabelText('Choose Broadset project file'), {
      target: {
        files: [new File([new Uint8Array(exported.bytes).buffer], 'project.bsp', { type: BSP_PROJECT_MIME_V1 })],
      },
    });

    await waitFor(() => {
      expect(store.getState().project.metadata.name).toBe('Packaged project');
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
    expect(store.getState().blobs).toEqual(blobs);
  });

  it('does not let an older slow import replace a newer project', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const firstProject = projectFormatV1.createProjectV1({ name: 'First slow project' });
    const secondProject = projectFormatV1.createProjectV1({ name: 'Second current project' });
    const firstFile = new File([], 'first.json', { type: 'application/json' });
    const secondFile = new File([], 'second.json', { type: 'application/json' });
    let resolveFirst: ((value: ArrayBuffer) => void) | undefined;
    const firstBytes = new Promise<ArrayBuffer>((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(firstFile, 'arrayBuffer').mockReturnValue(firstBytes);
    vi.spyOn(secondFile, 'arrayBuffer').mockResolvedValue(
      new TextEncoder().encode(projectFormatV1.canonicalizeProjectV1(secondProject)).buffer,
    );

    render(<V1ProjectFileControls editorStore={store} />);

    const input = screen.getByLabelText('Choose Broadset project file');

    fireEvent.change(input, { target: { files: [firstFile] } });
    fireEvent.change(input, { target: { files: [secondFile] } });

    await waitFor(() => {
      expect(store.getState().project.metadata.name).toBe('Second current project');
    });

    if (resolveFirst === undefined) throw new Error('Expected deferred project reader');

    const resolveDeferredFirst = resolveFirst;

    await act(async () => {
      resolveDeferredFirst(new TextEncoder().encode(projectFormatV1.canonicalizeProjectV1(firstProject)).buffer);
      await firstBytes;
    });

    expect(store.getState().project.metadata.name).toBe('Second current project');
  });
});
