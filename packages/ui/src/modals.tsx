import { Button, Input, Modal, Slider, Switch, Tabs, TextField } from '@heroui/react';
import type { JSX, Key } from 'react';
import { useState } from 'react';

import type { DocumentPreset, PresetCategory } from './modal-data';
import { BUILT_IN_CATEGORIES, EXPORT_FORMATS, SHORTCUT_GROUPS } from './modal-data';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MediaAsset {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly categoryId: string;
}

export interface MediaCategory {
  readonly id: string;
  readonly name: string;
}

interface GridSettings {
  readonly gridSize: number;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly snapThreshold: number;
}

interface GridChange {
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
}

// ---------------------------------------------------------------------------
// About Modal
// ---------------------------------------------------------------------------

export interface AboutModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>About</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>Broadset is a headless broadcast graphics template editor.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose}>Close</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Canvas Settings Modal
// ---------------------------------------------------------------------------

export interface CanvasSettingsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly documentName: string;
  readonly onDocumentNameChange: (name: string) => void;
  readonly viewMode: 'broadcast' | 'none' | 'print';
  readonly onViewModeChange: (mode: 'broadcast' | 'none' | 'print') => void;
  readonly showRulers: boolean;
  readonly onRulersChange: (show: boolean) => void;
  readonly perspectiveAngle: number;
  readonly onPerspectiveChange: (angle: number) => void;
  readonly gridSettings: GridSettings;
  readonly onGridChange: (settings: GridChange) => void;
}

export function CanvasSettingsModal({
  isOpen,
  onClose,
  documentName,
  onDocumentNameChange,
  viewMode,
  onViewModeChange,
  showRulers,
  onRulersChange,
  perspectiveAngle,
  onPerspectiveChange,
  gridSettings,
  onGridChange,
}: CanvasSettingsModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>Canvas Settings</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <TextField
              aria-label="Document name"
              value={documentName}
              onChange={(value) => {
                onDocumentNameChange(value);
              }}
            >
              <Input />
            </TextField>

            <div role="group" aria-label="View mode">
              <Button
                variant={viewMode === 'none' ? 'primary' : 'ghost'}
                onPress={() => {
                  onViewModeChange('none');
                }}
              >
                None
              </Button>
              <Button
                variant={viewMode === 'broadcast' ? 'primary' : 'ghost'}
                onPress={() => {
                  onViewModeChange('broadcast');
                }}
              >
                Broadcast
              </Button>
              <Button
                variant={viewMode === 'print' ? 'primary' : 'ghost'}
                onPress={() => {
                  onViewModeChange('print');
                }}
              >
                Print
              </Button>
            </div>

            <Switch
              isSelected={showRulers}
              onChange={(selected) => {
                onRulersChange(selected);
              }}
            >
              Rulers
            </Switch>

            <Slider
              aria-label="Perspective angle"
              minValue={0}
              maxValue={90}
              value={perspectiveAngle}
              onChange={(value) => {
                onPerspectiveChange(typeof value === 'number' ? value : (value[0] ?? 0));
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>

            <Switch
              isSelected={gridSettings.showGrid}
              onChange={(selected) => {
                onGridChange({ showGrid: selected, snapToGrid: gridSettings.snapToGrid });
              }}
            >
              Show Grid
            </Switch>

            <Switch
              isSelected={gridSettings.snapToGrid}
              onChange={(selected) => {
                onGridChange({ showGrid: gridSettings.showGrid, snapToGrid: selected });
              }}
            >
              Snap to Grid
            </Switch>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose}>Done</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Export Modal
// ---------------------------------------------------------------------------

export interface ExportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly featureConfig: Record<string, boolean>;
  readonly onExport: (format: string) => void;
}

export function ExportModal({ isOpen, onClose, featureConfig, onExport }: ExportModalProps): JSX.Element | null {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  if (!isOpen) return null;

  const enabledFormats = EXPORT_FORMATS.filter((f) => featureConfig[f.featureFlag] === true);

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>Export</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div role="listbox" aria-label="Export formats">
              {enabledFormats.map((f) => (
                <div
                  key={f.key}
                  role="option"
                  aria-selected={selectedFormat === f.key}
                  onClick={() => {
                    setSelectedFormat(f.key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedFormat(f.key);
                    }
                  }}
                  tabIndex={0}
                >
                  {f.label}
                </div>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button
              isDisabled={selectedFormat === null}
              onPress={() => {
                if (selectedFormat !== null) {
                  onExport(selectedFormat);
                }
              }}
            >
              Export
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Media Library Modal
// ---------------------------------------------------------------------------

export interface MediaLibraryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly assets: readonly MediaAsset[];
  readonly categories: readonly MediaCategory[];
  readonly onSelect: (assetId: string) => void;
  readonly onUploadRequest?: () => void;
}

export function MediaLibraryModal({
  isOpen,
  onClose,
  assets,
  categories,
  onSelect,
}: MediaLibraryModalProps): JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = searchQuery === '' || asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === null || asset.categoryId === activeCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>Media Library</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <TextField
              aria-label="Search"
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
              }}
            >
              <Input placeholder="Search..." />
            </TextField>

            {categories.length > 0 && (
              <Tabs
                aria-label="Categories"
                selectedKey={activeCategory ?? 'all'}
                onSelectionChange={(key: Key) => {
                  setActiveCategory(key === 'all' ? null : String(key));
                }}
              >
                <Tabs.List>
                  <Tabs.Tab id="all">All</Tabs.Tab>
                  {categories.map((cat) => (
                    <Tabs.Tab key={cat.id} id={cat.id}>
                      {cat.name}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}

            <div role="grid" aria-label="Assets">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  role="gridcell"
                  aria-selected={selectedAssetId === asset.id}
                  onClick={() => {
                    setSelectedAssetId(asset.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedAssetId(asset.id);
                    }
                  }}
                  tabIndex={0}
                >
                  {asset.name}
                </div>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button
              isDisabled={selectedAssetId === null}
              onPress={() => {
                if (selectedAssetId !== null) {
                  onSelect(selectedAssetId);
                }
              }}
            >
              Select
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// New Document Modal
// ---------------------------------------------------------------------------

export interface NewDocumentModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreateDocument: (preset: DocumentPreset) => void;
  readonly customPresets?: readonly PresetCategory[];
}

export function NewDocumentModal({
  isOpen,
  onClose,
  onCreateDocument,
  customPresets,
}: NewDocumentModalProps): JSX.Element | null {
  const [selectedPreset, setSelectedPreset] = useState<DocumentPreset | null>(null);

  if (!isOpen) return null;

  const presetCategories =
    customPresets !== undefined && customPresets.length > 0 ? customPresets : BUILT_IN_CATEGORIES;

  const allPresets = presetCategories.flatMap((cat) => cat.presets);

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>New Document</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div role="listbox" aria-label="Presets">
              {allPresets.map((preset) => (
                <div
                  key={preset.label}
                  role="option"
                  aria-selected={selectedPreset === preset}
                  onClick={() => {
                    setSelectedPreset(preset);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedPreset(preset);
                    }
                  }}
                  tabIndex={0}
                >
                  {preset.label}
                </div>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button
              isDisabled={selectedPreset === null}
              onPress={() => {
                if (selectedPreset !== null) {
                  onCreateDocument(selectedPreset);
                }
              }}
            >
              Create
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shortcut Help Modal
// ---------------------------------------------------------------------------

export interface ShortcutHelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>Keyboard Shortcuts</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.name}>
                <h3>{group.name}</h3>
                <dl>
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.description}>
                      <dt>
                        {shortcut.keys.split(/\s*\+\s*/).map((part, i) => (
                          <kbd key={i}>{part}</kbd>
                        ))}
                      </dt>
                      <dd>{shortcut.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose}>Close</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  );
}
