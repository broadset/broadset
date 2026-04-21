import { Modal } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

import { VISUALLY_HIDDEN_HEADING_STYLE } from './constants';

export function ModalShell({
  isOpen,
  size,
  title,
  onClose,
  children,
}: {
  readonly isOpen: boolean;
  readonly size: 'cover' | 'full' | 'lg' | 'md' | 'sm' | 'xs';
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const dialogContainerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dialogElement = dialogContainerRef.current?.querySelector<HTMLElement>('[role="dialog"]');

    if (dialogElement === null || dialogElement === undefined) {
      return;
    }

    dialogElement.setAttribute('aria-modal', 'true');
    dialogElement.setAttribute('aria-labelledby', titleId);
  }, [isOpen, titleId]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container scroll="outside" size={size}>
          <div ref={dialogContainerRef}>
            <Modal.Dialog aria-label={title} aria-labelledby={titleId}>
              <h2 id={titleId} style={VISUALLY_HIDDEN_HEADING_STYLE}>
                {title}
              </h2>
              <Modal.CloseTrigger aria-label="Close" />
              {children}
            </Modal.Dialog>
          </div>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
