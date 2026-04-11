import { Button, ButtonGroup, Input, Kbd, Modal, Select, Slider, Switch, Table, Tabs } from '@heroui/react';
import { X } from 'lucide-react';
import type { ChangeEvent, JSX, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import { NumField } from './inputs';
import { color, sp } from './tokens';

/* ================================================================== */
/*  Shared types                                                       */
/* ================================================================== */

/** A media asset for the Media Library. */
export interface MediaAsset {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly category: string;
}

/** A document preset for the New Document modal. */
export interface DocumentPreset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly unit: string;
  readonly mode: string;
  readonly category: string;
}

interface ShortcutEntry {
  readonly action: string;
  readonly keys: readonly string[];
}

export interface TemplateEntry {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
  readonly category: string;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const VIEW_MODES = ['broadcast', 'none', 'print'] as const;

const EXPORTER_CATEGORIES = [
  { category: 'Web', formats: ['html', 'svg'] },
  { category: 'Image', formats: ['png', 'jpeg', 'svg-embedded'] },
  { category: 'Document', formats: ['pdf', 'psd', 'pptx'] },
  { category: 'Video', formats: ['mp4', 'webm'] },
  { category: 'Broadcast', formats: ['ograf'] },
] as const;

/* ================================================================== */
/*  Modal shell — wraps compound v3 Modal structure                    */
/* ================================================================== */

function ModalShell({
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
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size={size}>
          <Modal.Dialog aria-label={title}>{children}</Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ================================================================== */
/*  About Modal                                                        */
/* ================================================================== */

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
          <dd>HTML, SVG, PDF, PSD, PPTX, PNG, JPEG, MP4, WebM, OGraf</dd>
        </dl>
        <p>Version: {version}</p>
      </Modal.Body>
    </ModalShell>
  );
}

/* ================================================================== */
/*  Canvas Settings Modal                                              */
/* ================================================================== */

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
        {/* Document section */}
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

        {/* Canvas section */}
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

        {/* 3D Perspective */}
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

        {/* Grid section */}
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

/* ================================================================== */
/*  Export Modal                                                        */
/* ================================================================== */

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

/* ================================================================== */
/*  Media Library Modal                                                */
/* ================================================================== */

export interface MediaLibraryModalProps {
  readonly isOpen: boolean;
  readonly assets: readonly MediaAsset[];
  readonly categories: readonly string[];
  readonly onSelect: (asset: MediaAsset) => void;
  readonly onClose: () => void;
  readonly onUploadRequest?: (() => void) | undefined;
}

export function MediaLibraryModal({
  isOpen,
  assets,
  categories,
  onSelect,
  onClose,
  onUploadRequest,
}: MediaLibraryModalProps): JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = searchQuery === '' || asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || asset.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleConfirm = useCallback(() => {
    if (selectedAsset !== null) {
      onSelect(selectedAsset);
    }
  }, [selectedAsset, onSelect]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Media Library" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Media Library</span>
      </Modal.Header>
      <Modal.Body>
        <Input
          aria-label="Search media"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSearchQuery(e.currentTarget.value);
          }}
        />
        <Tabs
          selectedKey={selectedCategory}
          onSelectionChange={(key) => {
            setSelectedCategory(String(key));
            setSelectedAsset(null);
          }}
        >
          <Tabs.List>
            {categories.map((cat) => (
              <Tabs.Tab key={cat} id={cat}>
                {cat}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        {filteredAssets.length === 0 ?
          <p style={{ color: color('muted'), textAlign: 'center', padding: sp('sp-05') }}>No media found</p>
        : <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: sp('sp-03'),
              maxHeight: '400px',
              overflowY: 'auto',
              marginTop: sp('sp-03'),
            }}
          >
            {filteredAssets.map((asset) => (
              <Button
                key={asset.id}
                aria-label={asset.name}
                style={{
                  border: selectedAsset?.id === asset.id ? `2px solid ${color('accent')}` : '1px solid transparent',
                  padding: sp('sp-02'),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
                variant="ghost"
                onPress={() => {
                  const now = Date.now();
                  const last = lastClickRef.current;

                  if (last !== null && last.id === asset.id && now - last.time < 400) {
                    onSelect(asset);
                    lastClickRef.current = null;
                  } else {
                    setSelectedAsset(asset);
                    lastClickRef.current = { id: asset.id, time: now };
                  }
                }}
              >
                <img alt={asset.name} src={asset.url} style={{ width: '100%', height: 'auto' }} />
                <span>{asset.name}</span>
              </Button>
            ))}
          </div>
        }
      </Modal.Body>
      <Modal.Footer>
        {onUploadRequest !== undefined && (
          <Button aria-label="Upload" variant="ghost" onPress={onUploadRequest}>
            Upload
          </Button>
        )}
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button aria-label="Select" isDisabled={selectedAsset === null} variant="primary" onPress={handleConfirm}>
          Select
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

/* ================================================================== */
/*  New Document Modal                                                 */
/* ================================================================== */

export interface NewDocumentModalProps {
  readonly isOpen: boolean;
  readonly presets: readonly DocumentPreset[];
  readonly onCreateDocument: (preset: DocumentPreset) => void;
  readonly onClose: () => void;
}

export function NewDocumentModal({
  isOpen,
  presets,
  onCreateDocument,
  onClose,
}: NewDocumentModalProps): JSX.Element | null {
  const [selectedPreset, setSelectedPreset] = useState<DocumentPreset | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const uniqueCategories = ['All', ...Array.from(new Set(presets.map((p) => p.category)))];

  const filteredPresets = selectedCategory === 'All' ? presets : presets.filter((p) => p.category === selectedCategory);

  const handleCreate = useCallback(() => {
    if (selectedPreset !== null) {
      onCreateDocument(selectedPreset);
    }
  }, [selectedPreset, onCreateDocument]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="New Document" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>New Document</span>
      </Modal.Header>
      <Modal.Body>
        <Tabs
          selectedKey={selectedCategory}
          onSelectionChange={(key) => {
            setSelectedCategory(String(key));
            setSelectedPreset(null);
          }}
        >
          <Tabs.List>
            {uniqueCategories.map((cat) => (
              <Tabs.Tab key={cat} id={cat}>
                {cat}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Table aria-label="Document presets">
          <Table.Header>
            <Table.Column>Name</Table.Column>
            <Table.Column>Dimensions</Table.Column>
            <Table.Column>Mode</Table.Column>
          </Table.Header>
          <Table.Body>
            {filteredPresets.map((preset) => (
              <Table.Row
                key={preset.name}
                data-selected={selectedPreset?.name === preset.name ? 'true' : undefined}
                style={{
                  backgroundColor: selectedPreset?.name === preset.name ? color('accent') : undefined,
                  cursor: 'pointer',
                }}
                onPress={() => {
                  setSelectedPreset(preset);
                }}
              >
                <Table.Cell>{preset.name}</Table.Cell>
                <Table.Cell>
                  {preset.width} × {preset.height} {preset.unit}
                </Table.Cell>
                <Table.Cell>{preset.mode}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button
          aria-label="Create document"
          isDisabled={selectedPreset === null}
          variant="primary"
          onPress={handleCreate}
        >
          Create
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

/* ================================================================== */
/*  Shortcut Help Modal                                                */
/* ================================================================== */

export interface ShortcutHelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly shortcuts?: Readonly<Record<string, readonly ShortcutEntry[]>> | undefined;
}

const DEFAULT_SHORTCUTS: Readonly<Record<string, readonly ShortcutEntry[]>> = {
  'Clipboard & Selection': [
    { action: 'Copy', keys: ['Ctrl', 'C'] },
    { action: 'Cut', keys: ['Ctrl', 'X'] },
    { action: 'Paste', keys: ['Ctrl', 'V'] },
    { action: 'Select all', keys: ['Ctrl', 'A'] },
    { action: 'Deselect', keys: ['Escape'] },
    { action: 'Duplicate', keys: ['Ctrl', 'D'] },
    { action: 'Delete', keys: ['Delete'] },
  ],
  Nudge: [
    { action: 'Nudge 1px', keys: ['Arrow'] },
    { action: 'Nudge 10px', keys: ['Shift', 'Arrow'] },
  ],
  'Layer Order': [
    { action: 'Bring forward', keys: ['Ctrl', ']'] },
    { action: 'Send backward', keys: ['Ctrl', '['] },
    { action: 'Bring to front', keys: ['Ctrl', 'Shift', ']'] },
    { action: 'Send to back', keys: ['Ctrl', 'Shift', '['] },
  ],
  'Grouping & Lock': [
    { action: 'Group', keys: ['Ctrl', 'G'] },
    { action: 'Ungroup', keys: ['Ctrl', 'Shift', 'G'] },
    { action: 'Lock / Unlock', keys: ['Ctrl', 'L'] },
  ],
  'Zoom & History': [
    { action: 'Zoom in', keys: ['Ctrl', '+'] },
    { action: 'Zoom out', keys: ['Ctrl', '-'] },
    { action: 'Fit to screen', keys: ['Ctrl', '0'] },
    { action: 'Undo', keys: ['Ctrl', 'Z'] },
    { action: 'Redo', keys: ['Ctrl', 'Shift', 'Z'] },
  ],
};

const LEFT_COLUMN_GROUPS = ['Clipboard & Selection', 'Nudge'] as const;
const RIGHT_COLUMN_GROUPS = ['Layer Order', 'Grouping & Lock', 'Zoom & History'] as const;

export function ShortcutHelpModal({ isOpen, onClose, shortcuts }: ShortcutHelpModalProps): JSX.Element | null {
  const groups = { ...DEFAULT_SHORTCUTS, ...shortcuts };

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Keyboard Shortcuts" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Keyboard Shortcuts</span>
        <Button aria-label="Close" isIconOnly size="sm" variant="ghost" onPress={onClose}>
          <X size={16} />
        </Button>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp('sp-05') }}>
          {/* Left column */}
          <div>
            {LEFT_COLUMN_GROUPS.map((groupName) => {
              const entries = groups[groupName];

              if (entries === undefined) return null;

              return (
                <div key={groupName} style={{ marginBottom: sp('sp-04') }}>
                  <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{groupName}</h4>
                  {entries.map((entry) => (
                    <div
                      key={entry.action}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${sp('sp-01')} 0`,
                      }}
                    >
                      <span>{entry.action}</span>
                      <span>
                        {entry.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {/* Right column */}
          <div>
            {RIGHT_COLUMN_GROUPS.map((groupName) => {
              const entries = groups[groupName];

              if (entries === undefined) return null;

              return (
                <div key={groupName} style={{ marginBottom: sp('sp-04') }}>
                  <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{groupName}</h4>
                  {entries.map((entry) => (
                    <div
                      key={entry.action}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${sp('sp-01')} 0`,
                      }}
                    >
                      <span>{entry.action}</span>
                      <span>
                        {entry.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Modal.Body>
    </ModalShell>
  );
}

/* ================================================================== */
/*  Guide Position Modal                                               */
/* ================================================================== */

export interface GuidePositionModalProps {
  readonly isOpen: boolean;
  readonly position: number;
  readonly unit: string;
  readonly onApply: (position: number) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

export function GuidePositionModal({
  isOpen,
  position,
  unit,
  onApply,
  onDelete,
  onClose,
}: GuidePositionModalProps): JSX.Element | null {
  const [localPosition, setLocalPosition] = useState(position);

  const handleApply = useCallback(() => {
    onApply(localPosition);
  }, [localPosition, onApply]);

  const handleKeyDown = useCallback(
    (event: { readonly key: string; preventDefault(): void }) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onApply(localPosition);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [localPosition, onApply, onClose],
  );

  return (
    <ModalShell isOpen={isOpen} size="sm" title="Guide Position" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Guide Position</span>
      </Modal.Header>
      <Modal.Body>
        <div onKeyDown={handleKeyDown}>
          <NumField label={`Position (${unit})`} value={localPosition} onChange={setLocalPosition} />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button aria-label="Delete guide" variant="danger" onPress={onDelete}>
          Delete
        </Button>
        <Button aria-label="Apply" variant="primary" onPress={handleApply}>
          Apply
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}

/* ================================================================== */
/*  Template Browser Modal                                             */
/* ================================================================== */

export interface TemplateBrowserModalProps {
  readonly isOpen: boolean;
  readonly templates: readonly TemplateEntry[];
  readonly hasUnsavedChanges: boolean;
  readonly onSelectTemplate: (template: TemplateEntry) => void;
  readonly onClose: () => void;
}

export function TemplateBrowserModal({
  isOpen,
  templates,
  hasUnsavedChanges,
  onSelectTemplate,
  onClose,
}: TemplateBrowserModalProps): JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEntry | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const filteredTemplates = templates.filter(
    (t) => searchQuery === '' || t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedTemplates = filteredTemplates.reduce<Record<string, TemplateEntry[]>>((acc, t) => {
    const group = acc[t.category] ?? [];

    group.push(t);
    acc[t.category] = group;

    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedTemplates).sort();

  const handleCreate = useCallback(() => {
    if (selectedTemplate === null) return;

    if (hasUnsavedChanges) {
      setShowConfirmation(true);
    } else {
      onSelectTemplate(selectedTemplate);
    }
  }, [selectedTemplate, hasUnsavedChanges, onSelectTemplate]);

  const handleConfirmCreate = useCallback(() => {
    if (selectedTemplate !== null) {
      onSelectTemplate(selectedTemplate);
    }
  }, [selectedTemplate, onSelectTemplate]);

  return (
    <ModalShell isOpen={isOpen} size="lg" title="Template Browser" onClose={onClose}>
      <Modal.Header>
        <span style={{ flex: 1, fontWeight: 700 }}>Template Browser</span>
      </Modal.Header>
      <Modal.Body>
        <Input
          aria-label="Search templates"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSearchQuery(e.currentTarget.value);
          }}
        />

        {templates.length === 0 ?
          <p style={{ color: color('muted'), textAlign: 'center', padding: sp('sp-05') }}>No templates available</p>
        : filteredTemplates.length === 0 ?
          <p style={{ color: color('muted'), textAlign: 'center', padding: sp('sp-05') }}>No templates found</p>
        : sortedCategories.map((category) => (
            <div key={category} style={{ marginTop: sp('sp-04') }}>
              <h4 style={{ fontWeight: 600, marginBottom: sp('sp-02') }}>{category}</h4>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: sp('sp-03'),
                }}
              >
                {groupedTemplates[category]?.map((template) => (
                  <Button
                    key={template.id}
                    aria-label={template.name}
                    style={{
                      border:
                        selectedTemplate?.id === template.id ? `2px solid ${color('accent')}` : '1px solid transparent',
                      padding: sp('sp-02'),
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                    variant="ghost"
                    onPress={() => {
                      setSelectedTemplate(template);
                    }}
                  >
                    <img alt={template.name} src={template.thumbnail} style={{ width: '100%', height: 'auto' }} />
                    <span>{template.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))
        }

        {showConfirmation && (
          <div
            aria-label="Confirmation"
            style={{
              marginTop: sp('sp-04'),
              padding: sp('sp-04'),
              borderRadius: '8px',
              backgroundColor: color('surface-secondary'),
            }}
          >
            <p>You have unsaved changes. Creating a new document will discard them.</p>
            <div style={{ display: 'flex', gap: sp('sp-02'), marginTop: sp('sp-03') }}>
              <Button
                variant="ghost"
                onPress={() => {
                  setShowConfirmation(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="danger" onPress={handleConfirmCreate}>
                Discard &amp; Create
              </Button>
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button
          aria-label="Create from template"
          isDisabled={selectedTemplate === null}
          variant="primary"
          onPress={handleCreate}
        >
          Create
        </Button>
      </Modal.Footer>
    </ModalShell>
  );
}
