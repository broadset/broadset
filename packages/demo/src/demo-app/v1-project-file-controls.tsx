import type { ProjectEditorStore } from '@broadset/editor';
import type { ProjectImportResultV1 } from '@broadset/formats';
import { projectFormatV1 } from '@broadset/model';
import { Button } from '@heroui/react';
import { type ChangeEvent, useRef, useState } from 'react';

import { loadFormats } from '../formatBridge';

const PROJECT_MIME = 'application/vnd.broadset.project+json';

type ProjectFileKind = 'bsp' | 'svg' | 'pdf' | 'psd' | 'pptx' | 'unsupported';

function projectFileKind(fileName: string): ProjectFileKind {
  const normalized = fileName.toLowerCase();

  if (normalized.endsWith('.bsp') || normalized.endsWith('.json')) return 'bsp';
  if (normalized.endsWith('.svg')) return 'svg';
  if (normalized.endsWith('.pdf')) return 'pdf';
  if (normalized.endsWith('.psd')) return 'psd';
  if (normalized.endsWith('.pptx')) return 'pptx';

  return 'unsupported';
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Broadset project file did not contain text'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Broadset project file could not be read'));
    };

    reader.readAsText(file);
  });
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('Broadset project file did not contain bytes'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Broadset project file could not be read'));
    };

    reader.readAsArrayBuffer(file);
  });
}

async function importExternalFile(
  file: File,
  kind: Exclude<ProjectFileKind, 'bsp' | 'unsupported'>,
  importedAt: projectFormatV1.UtcTimestamp,
): Promise<ProjectImportResultV1> {
  const formats = await loadFormats();

  switch (kind) {
    case 'svg':
      return await formats.importSvgProjectV1({ svg: await readFileText(file), fileName: file.name, importedAt });
    case 'pdf':
      return await formats.importPdfProjectV1({ bytes: await readFileBytes(file), fileName: file.name, importedAt });
    case 'psd':
      return await formats.importPsdProjectV1({ bytes: await readFileBytes(file), fileName: file.name, importedAt });
    case 'pptx':
      return await formats.importPptxProjectV1({ bytes: await readFileBytes(file), fileName: file.name, importedAt });
  }
}

interface V1ProjectFileControlsProps {
  readonly editorStore: ProjectEditorStore;
  readonly download?: ((blob: Blob, filename: string) => void) | undefined;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.download = filename;
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function V1ProjectFileControls({
  editorStore,
  download = downloadBlob,
}: V1ProjectFileControlsProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';
    if (file === undefined) return;

    try {
      const kind = projectFileKind(file.name);

      if (kind === 'unsupported') {
        setMessage('Unsupported project file type');

        return;
      }

      if (kind !== 'bsp') {
        const timestamp = projectFormatV1.utcTimestampSchema.safeParse(new Date().toISOString());

        if (!timestamp.success) {
          setMessage('Could not create an import timestamp');

          return;
        }

        const imported = await importExternalFile(file, kind, timestamp.data);
        const parsed = projectFormatV1.parseProjectV1Unknown(imported.project);

        if (parsed.status === 'loaded') {
          editorStore.getState().setProject(parsed.project, imported.blobs);
          setMessage('Project loaded');
        } else {
          setMessage(parsed.diagnostics.map(({ message: diagnostic }) => diagnostic).join('; '));
        }

        return;
      }

      const result = await projectFormatV1.loadProjectV1Json(await readFileText(file), {
        lastValidProject: editorStore.getState().project,
      });

      if (result.status === 'loaded') {
        editorStore.getState().setProject(result.project);
        setMessage('Project loaded');
      } else {
        setMessage(result.diagnostics.map(({ message: diagnostic }) => diagnostic).join('; '));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Broadset project file could not be loaded');
    }
  };

  const handleSave = (): void => {
    try {
      const text = projectFormatV1.canonicalizeProjectV1(editorStore.getState().project);

      download(new Blob([text], { type: PROJECT_MIME }), 'broadset-project.bsp');
      setMessage('Project saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Broadset project file could not be saved');
    }
  };

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
      <input
        ref={inputRef}
        accept=".bsp,.json,.svg,.pdf,.psd,.pptx,application/vnd.broadset.project+json,application/json,image/svg+xml,application/pdf"
        aria-label="Choose Broadset project file"
        style={{ display: 'none' }}
        type="file"
        onChange={(event) => {
          void handleImport(event);
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onPress={() => {
          inputRef.current?.click();
        }}
      >
        Open project
      </Button>
      <Button size="sm" variant="ghost" onPress={handleSave}>
        Save .bsp
      </Button>
      {message === '' ? null : <span role="status">{message}</span>}
    </div>
  );
}
