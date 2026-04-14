import { Button, Input, Modal, Table, Tabs } from '@heroui/react';
import { type ChangeEvent, type JSX, useCallback, useRef, useState } from 'react';

import { color, sp } from '../tokens';
import { ModalShell } from './modal-shell';
import type { DocumentPreset, MediaAsset } from './types';

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
          <Table.Content
            onRowAction={(key) => {
              const preset = filteredPresets.find((candidate) => candidate.name === String(key));

              if (preset !== undefined) {
                setSelectedPreset(preset);
              }
            }}
          >
            <Table.Header>
              <Table.Column id="name">Name</Table.Column>
              <Table.Column id="dimensions">Dimensions</Table.Column>
              <Table.Column id="mode">Mode</Table.Column>
            </Table.Header>
            <Table.Body>
              {filteredPresets.map((preset) => (
                <Table.Row
                  key={preset.name}
                  data-selected={selectedPreset?.name === preset.name ? 'true' : undefined}
                  id={preset.name}
                  style={{
                    backgroundColor: selectedPreset?.name === preset.name ? color('accent') : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <Table.Cell>{preset.name}</Table.Cell>
                  <Table.Cell>
                    {preset.width} x {preset.height} {preset.unit}
                  </Table.Cell>
                  <Table.Cell>{preset.mode}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
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
