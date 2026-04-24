import { Button, Select, Switch } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ModalShell } from './modal-shell';

/**
 * Phase 5 interleave I5.1 — shared format export options modal. The
 * PSD track (and later PDF/SVG/PPTX) drives format-specific export
 * options through this single entry so the chrome stays consistent
 * and accessible per the HeroUI mandate.
 */

export type FormatExportColorSpace = 'rgb' | 'cmyk' | 'lab' | 'grayscale';

export interface FormatExportOptionsValue {
  readonly colorSpace: FormatExportColorSpace;
  readonly bitDepth: 8 | 16;
  readonly embedIccProfile: boolean;
  readonly linkSmartObjects: boolean;
  readonly preserveVisibility: boolean;
}

export interface FormatExportOptionsModalProps {
  readonly isOpen: boolean;
  readonly formatLabel: string;
  /** When the format doesn't support a given switch it's omitted from the UI. */
  readonly supportedFields: ReadonlySet<keyof FormatExportOptionsValue>;
  readonly defaults: FormatExportOptionsValue;
  readonly onCancel: () => void;
  readonly onConfirm: (options: FormatExportOptionsValue) => void;
}

const COLOR_SPACE_LABELS: Record<FormatExportColorSpace, string> = {
  rgb: 'RGB',
  cmyk: 'CMYK',
  lab: 'Lab',
  grayscale: 'Grayscale',
};

export function FormatExportOptionsModal({
  isOpen,
  formatLabel,
  supportedFields,
  defaults,
  onCancel,
  onConfirm,
}: FormatExportOptionsModalProps): JSX.Element {
  const [value, setValue] = useState(defaults);
  const title = `${formatLabel} export options`;

  return (
    <ModalShell isOpen={isOpen} size="md" title={title} onClose={onCancel}>
      <div
        data-testid="format-export-options-body"
        style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        {supportedFields.has('colorSpace') ? (
          <Select
            aria-label="Color space"
            value={value.colorSpace}
            onChange={(key) => {
              const next = String(key) as FormatExportColorSpace;

              setValue((prev) => ({ ...prev, colorSpace: next }));
            }}
          >
            {(Object.keys(COLOR_SPACE_LABELS) as readonly FormatExportColorSpace[]).map((cs) => (
              <option key={cs} value={cs}>
                {COLOR_SPACE_LABELS[cs]}
              </option>
            ))}
          </Select>
        ) : null}

        {supportedFields.has('bitDepth') ? (
          <Select
            aria-label="Bit depth"
            value={String(value.bitDepth)}
            onChange={(key) => {
              const next = Number(String(key));

              setValue((prev) => ({ ...prev, bitDepth: next === 16 ? 16 : 8 }));
            }}
          >
            <option value="8">8-bit</option>
            <option value="16">16-bit</option>
          </Select>
        ) : null}

        {supportedFields.has('embedIccProfile') ? (
          <Switch
            isSelected={value.embedIccProfile}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, embedIccProfile: isSelected }));
            }}
            aria-label="Embed ICC profile"
          >
            Embed ICC profile
          </Switch>
        ) : null}

        {supportedFields.has('linkSmartObjects') ? (
          <Switch
            isSelected={value.linkSmartObjects}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, linkSmartObjects: isSelected }));
            }}
            aria-label="Link smart objects"
          >
            Keep smart objects linked
          </Switch>
        ) : null}

        {supportedFields.has('preserveVisibility') ? (
          <Switch
            isSelected={value.preserveVisibility}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, preserveVisibility: isSelected }));
            }}
            aria-label="Preserve visibility"
          >
            Preserve hidden elements
          </Switch>
        ) : null}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onPress={onCancel} aria-label="Cancel export options">
            Cancel
          </Button>
          <Button
            onPress={() => {
              onConfirm(value);
            }}
            aria-label="Confirm export options"
          >
            Export
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
