import { Button, ButtonGroup, Checkbox, Input, Label, Modal, ProgressBar, Select, Slider } from '@heroui/react';
import { type ChangeEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react';

import { NumField, ToggleSwitch } from '../inputs';
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
        <span style={{ fontWeight: 700 }}>Broadset</span>
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
  readonly showExperimentalFeatures: boolean;
  readonly onDocumentNameChange: (name: string) => void;
  readonly onRulerChange: (show: boolean) => void;
  readonly onRulerUnitChange: (unit: string) => void;
  readonly onViewModeChange: (mode: string) => void;
  readonly onPerspectiveChange: (value: number) => void;
  readonly onShowExperimentalFeaturesChange: (value: boolean) => void;
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
  showExperimentalFeatures,
  onDocumentNameChange,
  onRulerChange,
  onRulerUnitChange,
  onViewModeChange,
  onPerspectiveChange,
  onShowExperimentalFeaturesChange,
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
          <ToggleSwitch ariaLabel="Show rulers" isSelected={showRulers} onChange={onRulerChange}>
            Show rulers
          </ToggleSwitch>
          {showExperimentalFeatures ?
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
          : null}
          {showExperimentalFeatures ?
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
          : null}
        </section>

        <section aria-label="Experimental features" style={{ marginTop: sp('sp-04') }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: sp('sp-02') }}>Experimental</h3>
          <ToggleSwitch
            ariaLabel="Show experimental features"
            isSelected={showExperimentalFeatures}
            onChange={onShowExperimentalFeaturesChange}
          >
            Show experimental features
          </ToggleSwitch>
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
          <ToggleSwitch
            ariaLabel="Show grid"
            isSelected={showGrid}
            onChange={(value: boolean) => {
              onGridChange({ showGrid: value });
            }}
          >
            Show grid
          </ToggleSwitch>
          <div style={{ marginTop: sp('sp-02') }}>
            <NumField
              label="Grid size"
              value={gridSize}
              onChange={(v) => {
                onGridChange({ gridSize: v });
              }}
            />
          </div>
          <ToggleSwitch
            ariaLabel="Snap to grid"
            isSelected={snapToGrid}
            onChange={(value: boolean) => {
              onGridChange({ snapToGrid: value });
            }}
          >
            Snap to grid
          </ToggleSwitch>
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

/** Information about an animation available for export. */
export interface ExportAnimationInfo {
  readonly elementId: string;
  readonly elementName: string;
  readonly durationMs: number;
  readonly timelineCount: number;
}

/** Progress state during an active export. */
export interface ExportProgress {
  /** 0–1 progress value. */
  readonly progress: number;
  /** Human-readable stage label (e.g. "Rendering frames", "Encoding video"). */
  readonly stage: string;
}

export interface ExportModalProps {
  readonly isOpen: boolean;
  readonly enabledExporters: readonly string[];
  readonly dynamicData: Readonly<Record<string, unknown>>;
  readonly animations?: readonly ExportAnimationInfo[];
  readonly exportProgress?: ExportProgress | null;
  readonly onExport: (exporter: string, data: Readonly<Record<string, unknown>>) => void;
  readonly onClose: () => void;
}

/** Format milliseconds as a human-readable duration string. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${String(minutes)}m ${String(seconds)}s`;
  }

  return `${String(seconds)}s`;
}

export function ExportModal({
  isOpen,
  enabledExporters,
  dynamicData,
  animations,
  exportProgress,
  onExport,
  onClose,
}: ExportModalProps): JSX.Element | null {
  const [selectedExporter, setSelectedExporter] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pixelRatio, setPixelRatio] = useState(2);
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [videoFrameRate, setVideoFrameRate] = useState(30);
  const [videoQuality, setVideoQuality] = useState(0.8);
  const [selectedAnimationIds, setSelectedAnimationIds] = useState<ReadonlySet<string>>(new Set());

  const isVideoFormat = selectedExporter === 'mp4' || selectedExporter === 'webm';
  const isExporting = exportProgress !== null && exportProgress !== undefined;

  // Initialize selected animations to all when animations prop changes.
  useEffect(() => {
    if (animations !== undefined && animations.length > 0) {
      setSelectedAnimationIds(new Set(animations.map((a) => a.elementId)));
    }
  }, [animations]);

  // Compute total export duration from selected animations.
  const computedDurationMs = useMemo(() => {
    if (animations === undefined || animations.length === 0) {
      return 1000;
    }

    const selectedDurations = animations.filter((a) => selectedAnimationIds.has(a.elementId)).map((a) => a.durationMs);

    return Math.max(1000, ...selectedDurations);
  }, [animations, selectedAnimationIds]);

  // Auto-expand advanced options when a video format is selected so users
  // can see frame-rate and quality controls without hunting for the toggle.
  useEffect(() => {
    if (isVideoFormat) {
      setShowAdvanced(true);
    }
  }, [isVideoFormat]);

  const handleToggleAnimation = useCallback((elementId: string, isSelected: boolean) => {
    setSelectedAnimationIds((prev) => {
      const next = new Set(prev);

      if (isSelected) {
        next.add(elementId);
      } else {
        next.delete(elementId);
      }

      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    if (selectedExporter !== null) {
      onExport(selectedExporter, {
        ...dynamicData,
        pixelRatio,
        jpegQuality,
        videoFrameRate,
        videoQuality,
        selectedAnimationIds: [...selectedAnimationIds],
      });
    }
  }, [
    dynamicData,
    jpegQuality,
    onExport,
    pixelRatio,
    selectedAnimationIds,
    selectedExporter,
    videoFrameRate,
    videoQuality,
  ]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Export" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Export</span>
      </Modal.Header>
      <Modal.Body>
        {isExporting ?
          <section aria-label="Export progress">
            <p style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{exportProgress.stage}</p>
            <ProgressBar aria-label="Export progress" maxValue={1} minValue={0} value={exportProgress.progress}>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <p style={{ fontSize: '0.75rem', color: color('muted'), marginTop: sp('sp-01') }}>
              {Math.round(exportProgress.progress * 100)}%
            </p>
          </section>
        : <>
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

            {isVideoFormat && animations !== undefined && animations.length > 0 && (
              <section aria-label="Animation selection" style={{ marginTop: sp('sp-03') }}>
                <h4 style={{ fontSize: '0.75rem', color: color('muted'), marginBottom: sp('sp-01') }}>
                  Animations to export
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gap: sp('sp-01'),
                    padding: sp('sp-02'),
                    border: `1px solid ${color('border')}`,
                    borderRadius: 10,
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}
                >
                  {animations.map((anim) => (
                    <Checkbox
                      key={anim.elementId}
                      id={`export-anim-${anim.elementId}`}
                      isSelected={selectedAnimationIds.has(anim.elementId)}
                      onChange={(isSelected: boolean) => {
                        handleToggleAnimation(anim.elementId, isSelected);
                      }}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Checkbox.Content>
                        <Label htmlFor={`export-anim-${anim.elementId}`} style={{ fontSize: '0.8125rem' }}>
                          {anim.elementName || anim.elementId}
                          <span style={{ color: color('muted'), marginLeft: sp('sp-01') }}>
                            ({formatDuration(anim.durationMs)}, {String(anim.timelineCount)} timeline
                            {anim.timelineCount !== 1 ? 's' : ''})
                          </span>
                        </Label>
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: color('muted'), marginTop: sp('sp-01') }}>
                  Total duration: {formatDuration(computedDurationMs)}
                </p>
              </section>
            )}

            <section aria-label="Advanced export options" style={{ marginTop: sp('sp-02') }}>
              <ToggleSwitch
                ariaLabel="Show advanced export options"
                isSelected={showAdvanced}
                onChange={setShowAdvanced}
              >
                Advanced export options
              </ToggleSwitch>

              {showAdvanced && (
                <div
                  style={{
                    marginTop: sp('sp-02'),
                    padding: sp('sp-02'),
                    border: `1px solid ${color('border')}`,
                    borderRadius: 10,
                    display: 'grid',
                    gap: sp('sp-02'),
                  }}
                >
                  <NumField
                    label="Raster pixel ratio"
                    max={8}
                    min={1}
                    step={1}
                    value={pixelRatio}
                    onChange={(value) => {
                      setPixelRatio(Math.max(1, Math.min(8, Math.round(value))));
                    }}
                  />

                  <Slider
                    aria-label="JPEG quality"
                    maxValue={1}
                    minValue={0.1}
                    step={0.01}
                    value={jpegQuality}
                    onChange={(value) => {
                      setJpegQuality(typeof value === 'number' ? value : jpegQuality);
                    }}
                  >
                    JPEG quality ({jpegQuality.toFixed(2)})
                  </Slider>

                  <NumField
                    label="Video frame rate"
                    max={120}
                    min={1}
                    step={1}
                    value={videoFrameRate}
                    onChange={(value) => {
                      setVideoFrameRate(Math.max(1, Math.min(120, Math.round(value))));
                    }}
                  />

                  <Slider
                    aria-label="Video quality"
                    maxValue={1}
                    minValue={0.1}
                    step={0.01}
                    value={videoQuality}
                    onChange={(value) => {
                      setVideoQuality(typeof value === 'number' ? value : videoQuality);
                    }}
                  >
                    Video quality ({videoQuality.toFixed(2)})
                  </Slider>
                </div>
              )}
            </section>
          </>
        }
      </Modal.Body>
      <Modal.Footer>
        {isExporting ?
          <Button isDisabled variant="ghost" onPress={onClose}>
            Exporting…
          </Button>
        : <>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button aria-label="Export" isDisabled={selectedExporter === null} variant="primary" onPress={handleExport}>
              Export
            </Button>
          </>
        }
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
