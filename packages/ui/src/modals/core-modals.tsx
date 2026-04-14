import { Button, ButtonGroup, Input, Modal, Select, Slider, Switch } from '@heroui/react';
import { X } from 'lucide-react';
import { type ChangeEvent, type JSX, useCallback, useState } from 'react';

import { NumField } from '../inputs';
import { color, sp } from '../tokens';
import { EXPORTER_CATEGORIES, VIEW_MODES } from './constants';
import { ModalShell } from './modal-shell';

export interface AboutModalProps {
  readonly isOpen: boolean;
  readonly version: string;
  readonly onClose: () => void;
}

export function AboutModal({ isOpen, version, onClose }: AboutModalProps): JSX.Element | null {
  return (
    <ModalShell isOpen={isOpen} size="md" title="Broadset" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Broadset</span>
        <Button aria-label="Close" isIconOnly size="sm" variant="ghost" onPress={onClose}>
          <X size={16} />
        </Button>
      </Modal.Header>
      <Modal.Body>
        <p>
          Broadset is a professional template design and broadcast graphics editor for creating dynamic, data-driven
          visual content.
        </p>
        <dl>
          <dt>Stack</dt>
          <dd>React, Zustand, HeroUI v3</dd>
          <dt>Renderer</dt>
          <dd>HTML / CSS / Canvas</dd>
          <dt>Exports</dt>
          <dd>HTML, SVG, PDF, PSD, PPTX, PNG, JPEG, WebM, OGraf</dd>
        </dl>
        <p>Version: {version}</p>
      </Modal.Body>
    </ModalShell>
  );
}

export interface CanvasSettingsModalProps {
  readonly isOpen: boolean;
  readonly documentName: string;
  readonly showRulers: boolean;
  readonly rulerUnit: 'in' | 'mm' | 'px';
  readonly viewMode: 'broadcast' | 'none' | 'print';
  readonly perspective: number;
  readonly showGrid: boolean;
  readonly gridSize: number;
  readonly snapToGrid: boolean;
  readonly snapThreshold: number;
  readonly onDocumentNameChange: (name: string) => void;
  readonly onRulerChange: (show: boolean) => void;
  readonly onRulerUnitChange: (unit: string) => void;
  readonly onViewModeChange: (mode: string) => void;
  readonly onPerspectiveChange: (value: number) => void;
  readonly onGridChange: (
    changes: Partial<{
      showGrid: boolean;
      gridSize: number;
      snapToGrid: boolean;
      snapThreshold: number;
    }>,
  ) => void;
  readonly onClose: () => void;
}

export function CanvasSettingsModal({
  isOpen,
  documentName,
  showRulers,
  rulerUnit,
  viewMode,
  perspective,
  showGrid,
  gridSize,
  snapToGrid,
  snapThreshold,
  onDocumentNameChange,
  onRulerChange,
  onRulerUnitChange,
  onViewModeChange,
  onPerspectiveChange,
  onGridChange,
  onClose,
}: CanvasSettingsModalProps): JSX.Element | null {
  return (
    <ModalShell isOpen={isOpen} size="lg" title="Canvas Settings" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Canvas Settings</span>
      </Modal.Header>
      <Modal.Body>
        <section aria-label="Document">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: sp('sp-02') }}>Document</h3>
          <Input
            aria-label="Document name"
            value={documentName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              onDocumentNameChange(e.currentTarget.value);
            }}
          />
        </section>

        <section aria-label="Canvas" style={{ marginTop: sp('sp-04') }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: sp('sp-02') }}>Canvas</h3>
          <Switch aria-label="Show rulers" isSelected={showRulers} onChange={onRulerChange}>
            Show rulers
          </Switch>
          <div style={{ marginTop: sp('sp-02') }}>
            <Select
              aria-label="Ruler units"
              value={rulerUnit}
              onChange={(key) => {
                onRulerUnitChange(String(key));
              }}
            >
              <option value="px">px</option>
              <option value="mm">mm</option>
              <option value="in">in</option>
            </Select>
          </div>
          <div style={{ marginTop: sp('sp-02') }}>
            <ButtonGroup>
              {VIEW_MODES.map((mode) => (
                <Button
                  key={mode}
                  aria-label={mode}
                  variant={viewMode === mode ? 'primary' : 'ghost'}
                  onPress={() => {
                    onViewModeChange(mode);
                  }}
                >
                  {mode}
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </section>

        <section aria-label="3D Perspective" style={{ marginTop: sp('sp-04') }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: sp('sp-02') }}>3D Perspective</h3>
          <Slider
            aria-label="Perspective"
            maxValue={5000}
            minValue={100}
            value={perspective}
            onChange={(v) => {
              onPerspectiveChange(typeof v === 'number' ? v : (v[0] ?? 0));
            }}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </section>

        <section aria-label="Grid" style={{ marginTop: sp('sp-04') }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: sp('sp-02') }}>Grid</h3>
          <Switch
            aria-label="Show grid"
            isSelected={showGrid}
            onChange={(value: boolean) => {
              onGridChange({ showGrid: value });
            }}
          >
            Show grid
          </Switch>
          <div style={{ marginTop: sp('sp-02') }}>
            <NumField
              label="Grid size"
              value={gridSize}
              onChange={(v) => {
                onGridChange({ gridSize: v });
              }}
            />
          </div>
          <Switch
            aria-label="Snap to grid"
            isSelected={snapToGrid}
            onChange={(value: boolean) => {
              onGridChange({ snapToGrid: value });
            }}
          >
            Snap to grid
          </Switch>
          <div style={{ marginTop: sp('sp-02') }}>
            <NumField
              label="Snap threshold"
              value={snapThreshold}
              onChange={(v) => {
                onGridChange({ snapThreshold: v });
              }}
            />
          </div>
        </section>
      </Modal.Body>
      <Modal.Footer>
        <Button aria-label="Done" variant="primary" onPress={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

export interface ExportModalProps {
  readonly isOpen: boolean;
  readonly enabledExporters: readonly string[];
  readonly dynamicData: Readonly<Record<string, unknown>>;
  readonly onExport: (exporter: string, data: Readonly<Record<string, unknown>>) => void;
  readonly onClose: () => void;
}

export function ExportModal({
  isOpen,
  enabledExporters,
  dynamicData,
  onExport,
  onClose,
}: ExportModalProps): JSX.Element | null {
  const [selectedExporter, setSelectedExporter] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    if (selectedExporter !== null) {
      onExport(selectedExporter, dynamicData);
    }
  }, [selectedExporter, dynamicData, onExport]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Export" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Export</span>
      </Modal.Header>
      <Modal.Body>
        {EXPORTER_CATEGORIES.map(({ category, formats }) => {
          const enabledFormats = formats.filter((f) => enabledExporters.includes(f));

          if (enabledFormats.length === 0) return null;

          return (
            <div key={category} style={{ marginBottom: sp('sp-03') }}>
              <h4 style={{ fontSize: '0.75rem', color: color('muted'), marginBottom: sp('sp-01') }}>{category}</h4>
              <div style={{ display: 'flex', gap: sp('sp-02'), flexWrap: 'wrap' }}>
                {enabledFormats.map((format) => (
                  <Button
                    key={format}
                    aria-label={format.toUpperCase()}
                    variant={selectedExporter === format ? 'primary' : 'ghost'}
                    onPress={() => {
                      setSelectedExporter(format);
                    }}
                  >
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button aria-label="Export" isDisabled={selectedExporter === null} variant="primary" onPress={handleExport}>
          Export
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

export {
  MediaLibraryModal,
  type MediaLibraryModalProps,
  NewDocumentModal,
  type NewDocumentModalProps,
} from './core-modals-library';
