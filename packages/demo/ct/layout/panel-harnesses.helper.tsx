import { type LayerInfo, LayersSidebar } from '@broadset/ui';
import { type JSX, useState } from 'react';

const BASE_LAYERS: readonly LayerInfo[] = [
  { id: 'layer-title', type: 'text', name: 'Title', visible: true, locked: false },
  { id: 'layer-badge', type: 'rectangle', name: 'Badge', visible: true, locked: false },
  { id: 'layer-logo', type: 'image', name: 'Logo', visible: true, locked: false },
];

export function LayersHarness(): JSX.Element {
  const [layers, setLayers] = useState(BASE_LAYERS);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  return (
    <>
      <LayersSidebar
        layers={layers}
        selectedIds={selectedIds}
        onSelect={(id) => {
          setSelectedIds([id]);
        }}
        onToggleLock={(id) => {
          setLayers((existing) =>
            existing.map((layer) => (layer.id === id ? { ...layer, locked: !layer.locked } : layer)),
          );
        }}
        onToggleVisibility={(id) => {
          setLayers((existing) =>
            existing.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
          );
        }}
        onDelete={(id) => {
          setLayers((existing) => existing.filter((layer) => layer.id !== id));
        }}
        onRename={(id, name) => {
          setLayers((existing) => existing.map((layer) => (layer.id === id ? { ...layer, name } : layer)));
        }}
        onReorder={(dragId, targetId, position) => {
          setLayers((existing) => {
            const dragIndex = existing.findIndex((layer) => layer.id === dragId);
            const targetIndex = existing.findIndex((layer) => layer.id === targetId);

            if (dragIndex < 0 || targetIndex < 0 || dragIndex === targetIndex) {
              return existing;
            }

            const next = [...existing];
            const [moved] = next.splice(dragIndex, 1);

            if (moved === undefined) {
              return existing;
            }

            const anchorIndex = next.findIndex((layer) => layer.id === targetId);

            if (anchorIndex < 0) {
              return existing;
            }

            const insertionIndex = position === 'before' ? anchorIndex : anchorIndex + 1;

            next.splice(insertionIndex, 0, moved);

            return next;
          });
        }}
      />
      <output data-testid="layers-order">{layers.map((layer) => layer.name).join(' > ')}</output>
      <output data-testid="layers-state">
        {layers.map((layer) => `${layer.name}:${String(layer.visible)}:${String(layer.locked)}`).join('|')}
      </output>
    </>
  );
}
