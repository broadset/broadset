import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { AboutModal, ShortcutHelpModal } from '@broadset/ui';
import { Button, Modal } from '@heroui/react';

export type V1HostDialog = 'about' | 'media-library' | 'new-document' | 'shortcuts' | null;
type SimpleV1HostDialog = Exclude<V1HostDialog, 'about' | 'shortcuts' | null>;

interface V1HostDialogsProps {
  readonly activeDialog: V1HostDialog;
  readonly editorStore: ProjectEditorStore;
  readonly onClose: () => void;
}

function dialogTitle(activeDialog: SimpleV1HostDialog): string {
  switch (activeDialog) {
    case 'media-library':
      return 'Media Library';
    case 'new-document':
      return 'New Document';
  }
}

function renderDialogBody(
  activeDialog: SimpleV1HostDialog,
  editorStore: ProjectEditorStore,
  onClose: () => void,
): React.JSX.Element {
  switch (activeDialog) {
    case 'new-document':
      return (
        <>
          <p>Create a valid blank BroadsetProjectV1 with one document and one page.</p>
          <Button
            variant="primary"
            onPress={() => {
              editorStore.getState().setProject(projectFormatV1.createProjectV1());
              onClose();
            }}
          >
            Create blank project
          </Button>
        </>
      );

    case 'media-library': {
      const assets = editorStore.getState().project.resources.assets;

      if (assets.length === 0) return <p>No packaged assets in this project.</p>;

      return (
        <ul>
          {assets.map((asset) => (
            <li key={asset.id}>{asset.name}</li>
          ))}
        </ul>
      );
    }
  }
}

function V1HostModal({
  activeDialog,
  editorStore,
  onClose,
}: {
  readonly activeDialog: SimpleV1HostDialog;
  readonly editorStore: ProjectEditorStore;
  readonly onClose: () => void;
}): React.JSX.Element {
  const title = dialogTitle(activeDialog);

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog aria-label={title}>
            <Modal.CloseTrigger aria-label="Close" />
            <Modal.Header>{title}</Modal.Header>
            <Modal.Body>{renderDialogBody(activeDialog, editorStore, onClose)}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function V1HostDialogs({ activeDialog, editorStore, onClose }: V1HostDialogsProps): React.JSX.Element | null {
  if (activeDialog === 'about') return <AboutModal isOpen version="0.1.0" onClose={onClose} />;
  if (activeDialog === 'shortcuts') return <ShortcutHelpModal isOpen onClose={onClose} />;
  if (activeDialog === null) return null;

  return <V1HostModal activeDialog={activeDialog} editorStore={editorStore} onClose={onClose} />;
}
