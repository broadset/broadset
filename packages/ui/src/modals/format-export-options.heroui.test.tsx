/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FormatExportOptionsModal, type FormatExportOptionsValue } from './format-export-options';

vi.mock('./modal-shell', () => ({
  ModalShell: ({ children }: { readonly children: ReactNode }): JSX.Element => <>{children}</>,
}));

const DEFAULT_OPTIONS: FormatExportOptionsValue = {
  colorSpace: 'rgb',
  bitDepth: 8,
  embedIccProfile: true,
  linkSmartObjects: false,
  preserveVisibility: true,
  fontEmbedding: 'embed',
  includeMetadata: true,
  includeElementTagging: true,
  pdfaConformance: 'none',
  embedFonts: false,
};

describe('FormatExportOptionsModal HeroUI integration', () => {
  /** @description Export option switches must retain accessible switch semantics and update the confirmed value. */
  it('toggles an export option through the real HeroUI switch', () => {
    const onConfirm = vi.fn<(options: FormatExportOptionsValue) => void>();

    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="PDF"
        supportedFields={new Set(['embedIccProfile'])}
        defaults={DEFAULT_OPTIONS}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Embed ICC profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm export options' }));

    expect(onConfirm).toHaveBeenCalledWith({ ...DEFAULT_OPTIONS, embedIccProfile: false });
  });
});
