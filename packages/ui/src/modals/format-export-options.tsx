import { Button, ListBox, Select } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { ToggleSwitch } from '../inputs';
import { ModalShell } from './modal-shell';

/**
 * Phase 5 interleave I5.1 — shared format export options modal. The
 * PSD track (and later PDF/SVG/PPTX) drives format-specific export
 * options through this single entry so the chrome stays consistent
 * and accessible per the HeroUI mandate.
 */

export type FormatExportColorSpace = 'rgb' | 'cmyk' | 'lab' | 'grayscale';
export type FormatExportFontEmbedding = 'embed' | 'reference' | 'flatten';
export type PdfAConformance = 'none' | '2b' | '2u' | '2a';

export interface FormatExportOptionsValue {
  readonly colorSpace: FormatExportColorSpace;
  readonly bitDepth: 8 | 16;
  readonly embedIccProfile: boolean;
  readonly linkSmartObjects: boolean;
  readonly preserveVisibility: boolean;
  /** SVG-only: font-embedding strategy. Default `'embed'`. */
  readonly fontEmbedding: FormatExportFontEmbedding;
  /** SVG-only: emit `<metadata>` RDF packet with document-level state. */
  readonly includeMetadata: boolean;
  /** SVG-only: emit `data-bs-*` / `broadset:content-hash` on every rendered element. */
  readonly includeElementTagging: boolean;
  /** PDF-only: PDF/A conformance level. Default `'none'` (no PDF/A). */
  readonly pdfaConformance: PdfAConformance;
  /** PPTX-only: when true, the demo passes its project FontAssets to the PPTX exporter for subset + embed under `ppt/fonts/`. */
  readonly embedFonts: boolean;
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

const FONT_EMBEDDING_LABELS: Record<FormatExportFontEmbedding, string> = {
  embed: 'Embed (recommended)',
  reference: 'External reference',
  flatten: 'Flatten text to paths',
};

const PDFA_CONFORMANCE_LABELS: Record<PdfAConformance, string> = {
  none: 'None (standard PDF)',
  '2b': 'PDF/A-2b (basic)',
  '2u': 'PDF/A-2u (Unicode)',
  '2a': 'PDF/A-2a (accessible)',
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
        {supportedFields.has('colorSpace') ?
          <Select
            aria-label="Color space"
            value={value.colorSpace}
            onChange={(key) => {
              if (key === null) return;

              const next = String(key) as FormatExportColorSpace;

              setValue((prev) => ({ ...prev, colorSpace: next }));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(Object.keys(COLOR_SPACE_LABELS) as readonly FormatExportColorSpace[]).map((cs) => (
                  <ListBox.Item id={cs} key={cs} textValue={COLOR_SPACE_LABELS[cs]}>
                    {COLOR_SPACE_LABELS[cs]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        : null}

        {supportedFields.has('bitDepth') ?
          <Select
            aria-label="Bit depth"
            value={String(value.bitDepth)}
            onChange={(key) => {
              if (key === null) return;

              const next = Number(String(key));

              setValue((prev) => ({ ...prev, bitDepth: next === 16 ? 16 : 8 }));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="8" textValue="8-bit">
                  8-bit
                </ListBox.Item>
                <ListBox.Item id="16" textValue="16-bit">
                  16-bit
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        : null}

        {supportedFields.has('embedIccProfile') ?
          <ToggleSwitch
            isSelected={value.embedIccProfile}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, embedIccProfile: isSelected }));
            }}
            ariaLabel="Embed ICC profile"
          >
            Embed ICC profile
          </ToggleSwitch>
        : null}

        {supportedFields.has('linkSmartObjects') ?
          <ToggleSwitch
            isSelected={value.linkSmartObjects}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, linkSmartObjects: isSelected }));
            }}
            ariaLabel="Link smart objects"
          >
            Keep smart objects linked
          </ToggleSwitch>
        : null}

        {supportedFields.has('preserveVisibility') ?
          <ToggleSwitch
            isSelected={value.preserveVisibility}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, preserveVisibility: isSelected }));
            }}
            ariaLabel="Preserve visibility"
          >
            Preserve hidden elements
          </ToggleSwitch>
        : null}

        {supportedFields.has('fontEmbedding') ?
          <Select
            aria-label="Font embedding"
            value={value.fontEmbedding}
            onChange={(key) => {
              if (key === null) return;

              const next = String(key) as FormatExportFontEmbedding;

              setValue((prev) => ({ ...prev, fontEmbedding: next }));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(Object.keys(FONT_EMBEDDING_LABELS) as readonly FormatExportFontEmbedding[]).map((choice) => (
                  <ListBox.Item id={choice} key={choice} textValue={FONT_EMBEDDING_LABELS[choice]}>
                    {FONT_EMBEDDING_LABELS[choice]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        : null}

        {supportedFields.has('includeMetadata') ?
          <ToggleSwitch
            isSelected={value.includeMetadata}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, includeMetadata: isSelected }));
            }}
            ariaLabel="Include document metadata packet"
          >
            Include document metadata (for round-trip)
          </ToggleSwitch>
        : null}

        {supportedFields.has('includeElementTagging') ?
          <ToggleSwitch
            isSelected={value.includeElementTagging}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, includeElementTagging: isSelected }));
            }}
            ariaLabel="Include per-element tagging"
          >
            Tag elements for reconciliation
          </ToggleSwitch>
        : null}

        {supportedFields.has('pdfaConformance') ?
          <Select
            aria-label="PDF/A conformance"
            value={value.pdfaConformance}
            onChange={(key) => {
              if (key === null) return;

              const next = String(key) as PdfAConformance;

              setValue((prev) => ({ ...prev, pdfaConformance: next }));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(Object.keys(PDFA_CONFORMANCE_LABELS) as readonly PdfAConformance[]).map((choice) => (
                  <ListBox.Item id={choice} key={choice} textValue={PDFA_CONFORMANCE_LABELS[choice]}>
                    {PDFA_CONFORMANCE_LABELS[choice]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        : null}

        {supportedFields.has('embedFonts') ?
          <ToggleSwitch
            isSelected={value.embedFonts}
            onChange={(isSelected) => {
              setValue((prev) => ({ ...prev, embedFonts: isSelected }));
            }}
            ariaLabel="Embed fonts"
          >
            Embed project fonts
          </ToggleSwitch>
        : null}

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
