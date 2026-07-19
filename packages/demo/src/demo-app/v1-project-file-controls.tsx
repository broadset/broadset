import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { Button, toast } from '@heroui/react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { loadFormats } from '../formats-loader';
import { downloadBlob } from './v1-browser-download';

const PROJECT_JSON_MIME = 'application/vnd.broadset.project+json';

type ProjectFileKind = 'bsp-package' | 'bsp-json' | 'unsupported';

function projectFileKind(fileName: string): ProjectFileKind {
  const normalized = fileName.toLowerCase();

  if (normalized.endsWith('.bsp')) return 'bsp-package';
  if (normalized.endsWith('.broadset.json') || normalized.endsWith('.json')) return 'bsp-json';

  return 'unsupported';
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function replaceProject(input: {
  readonly editorStore: ProjectEditorStore;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
}): string {
  return input.editorStore.getState().setProject(input.project, input.blobs) ?
      'Project loaded'
    : 'Project was rejected';
}

async function loadBroadsetProject(input: {
  readonly editorStore: ProjectEditorStore;
  readonly file: File;
  readonly kind: 'bsp-package' | 'bsp-json';
  readonly isCurrent: () => boolean;
  readonly onProjectQuarantined: ((bytes: Uint8Array) => void) | undefined;
}): Promise<string> {
  const lastValidProject = input.editorStore.getState().project;

  if (input.kind === 'bsp-package') {
    const formats = await loadFormats();

    if (input.file.size > formats.BSP_PACKAGE_LIMITS_V1.maxInputBytes) {
      return 'BSP project exceeds the 256 MiB file limit';
    }

    const result = await formats.loadBspPackageV1(await readFileBytes(input.file), { lastValidProject });

    if (!input.isCurrent()) return '';

    if (result.status === 'loaded') {
      return replaceProject({ editorStore: input.editorStore, project: result.project, blobs: result.blobs });
    }

    input.onProjectQuarantined?.(result.originalBytes);

    return result.diagnostics.map(({ message }) => message).join('; ');
  }

  if (input.file.size > projectFormatV1.PROJECT_V1_LIMITS.maxJsonTextBytes) {
    return 'Broadset JSON exceeds the 32 MiB file limit';
  }

  const result = await projectFormatV1.loadProjectV1Json(await readFileBytes(input.file), { lastValidProject });

  if (!input.isCurrent()) return '';

  if (result.status === 'loaded') {
    return replaceProject({ editorStore: input.editorStore, project: result.project });
  }

  input.onProjectQuarantined?.(result.originalBytes);

  return result.diagnostics.map(({ message }) => message).join('; ');
}

function browserBlobBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ?
        bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  return new Uint8Array(bytes).buffer;
}

interface V1ProjectFileControlsProps {
  readonly editorStore: ProjectEditorStore;
  readonly download?: ((blob: Blob, filename: string) => void) | undefined;
  readonly onProjectQuarantined?: ((bytes: Uint8Array) => void) | undefined;
}

export function V1ProjectFileControls({
  editorStore,
  download = downloadBlob,
  onProjectQuarantined,
}: V1ProjectFileControlsProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importGenerationRef = useRef(0);
  const [message, setMessage] = useState('');
  const messageIsSuccess = message === 'Project loaded' || message === 'Project saved';

  const showMessage = (nextMessage: string): void => {
    if (nextMessage === '') return;

    setMessage(nextMessage);

    if (nextMessage === 'Project loaded' || nextMessage === 'Project saved') {
      toast.success(nextMessage, { timeout: 3000 });
    } else {
      toast.danger(nextMessage, { timeout: 5000 });
    }
  };

  useEffect(
    () => () => {
      importGenerationRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (message === '') return undefined;

    const timeoutId = window.setTimeout(
      () => {
        setMessage('');
      },
      messageIsSuccess ? 3000 : 5000,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message, messageIsSuccess]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const generation = importGenerationRef.current + 1;
    const file = event.currentTarget.files?.[0];

    importGenerationRef.current = generation;
    event.currentTarget.value = '';
    if (file === undefined) return;

    const isCurrent = (): boolean => importGenerationRef.current === generation;

    try {
      const kind = projectFileKind(file.name);

      if (kind === 'unsupported') {
        showMessage('Unsupported project file type');

        return;
      }

      const nextMessage = await loadBroadsetProject({ editorStore, file, kind, isCurrent, onProjectQuarantined });

      if (isCurrent()) showMessage(nextMessage);
    } catch (error) {
      if (isCurrent()) {
        showMessage(error instanceof Error ? error.message : 'Broadset project file could not be loaded');
      }
    }
  };

  const handleSave = async (): Promise<void> => {
    try {
      const state = editorStore.getState();
      const formats = await loadFormats();
      const result = await formats.exportBspPackageV1({ project: state.project, blobs: state.blobs });

      if (result.status !== 'exported') {
        showMessage(result.diagnostics.map(({ message: diagnostic }) => diagnostic).join('; '));

        return;
      }

      download(
        new Blob([browserBlobBuffer(result.bytes)], { type: formats.BSP_PROJECT_MIME_V1 }),
        'broadset-project.bsp',
      );
      showMessage('Project saved');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Broadset project file could not be saved');
    }
  };

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
      <input
        ref={inputRef}
        accept={`.bsp,.broadset.json,.json,application/vnd.broadset.project,${PROJECT_JSON_MIME},application/json`}
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
      <Button
        size="sm"
        variant="ghost"
        onPress={() => {
          void handleSave();
        }}
      >
        Save .bsp
      </Button>
      {message === '' ? null : <span role="status">{message}</span>}
    </div>
  );
}
