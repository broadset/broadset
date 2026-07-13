import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { Button } from '@heroui/react';
import { type ChangeEvent, useRef, useState } from 'react';

const PROJECT_MIME = 'application/vnd.broadset.project+json';

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
        accept=".bsp,application/vnd.broadset.project+json,application/json"
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
        Open .bsp
      </Button>
      <Button size="sm" variant="ghost" onPress={handleSave}>
        Save .bsp
      </Button>
      {message === '' ? null : <span role="status">{message}</span>}
    </div>
  );
}
