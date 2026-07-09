import type { ModifierTimelineBinding, StateTimelineBinding, Timeline } from '@broadset/model';
import { Button } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import { type JSX, useCallback, useMemo } from 'react';

import { color, sp } from '../tokens';

export interface AnimationBindingSectionsProps {
  readonly stateBindings: readonly StateTimelineBinding[];
  readonly modifierBindings: readonly ModifierTimelineBinding[];
  readonly timelines: readonly Timeline[];
  readonly onAddStateBinding: (stateName: string, timelineId: string) => void;
  readonly onRemoveStateBinding: (stateName: string) => void;
  readonly onRenameStateBinding: (oldName: string, newName: string) => void;
  readonly onAddModifierBinding: (modifierName: string, inTimelineId: string, outTimelineId: string) => void;
  readonly onRemoveModifierBinding: (modifierName: string) => void;
}

function sortStateBindings(bindings: readonly StateTimelineBinding[]): readonly StateTimelineBinding[] {
  return [...bindings].sort((a, b) => {
    const order = (name: string): number => {
      if (name === 'Enter') return -1;
      if (name === 'Exit') return 1;

      return 0;
    };

    const oa = order(a.stateName);
    const ob = order(b.stateName);

    if (oa !== ob) {
      return oa - ob;
    }

    return a.stateName.localeCompare(b.stateName);
  });
}

function generateModifierId(): string {
  return `mod-${crypto.randomUUID().slice(0, 8)}`;
}

export function AnimationBindingSections(props: AnimationBindingSectionsProps): JSX.Element {
  const {
    stateBindings,
    modifierBindings,
    timelines,
    onAddStateBinding,
    onRemoveStateBinding,
    onRenameStateBinding: _onRenameStateBinding,
    onAddModifierBinding,
    onRemoveModifierBinding,
  } = props;

  const timelineMap = useMemo(() => {
    const map = new Map<string, Timeline>();

    for (const tl of timelines) {
      map.set(tl.id, tl);
    }

    return map;
  }, [timelines]);

  const sortedBindings = useMemo(() => sortStateBindings(stateBindings), [stateBindings]);

  const handleAddState = useCallback(() => {
    const id = generateModifierId();

    onAddStateBinding(`state-${id}`, timelines[0]?.id ?? `tl-${id}`);
  }, [onAddStateBinding, timelines]);

  const handleAddModifier = useCallback(() => {
    const id = generateModifierId();

    onAddModifierBinding(`modifier-${id}`, `tl-in-${id}`, `tl-out-${id}`);
  }, [onAddModifierBinding]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: sp('sp-02'),
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
            }}
          >
            State Bindings
          </span>
          <Button size="sm" variant="ghost" aria-label="Add state" onPress={handleAddState}>
            <Plus size={12} />
          </Button>
        </div>
        {sortedBindings.map((binding) => {
          const tl = timelineMap.get(binding.timelineId);

          return (
            <div
              key={binding.stateName}
              data-testid="state-binding-item"
              data-state-name={binding.stateName}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${sp('sp-01')} ${sp('sp-02')}`,
                borderBottom: `1px solid ${color('border')}`,
                fontSize: '12px',
                color: color('foreground'),
              }}
            >
              <span>{binding.stateName}</span>
              <span style={{ color: color('muted') }}>{tl?.name ?? binding.timelineId}</span>
              {binding.stateName !== 'Enter' && binding.stateName !== 'Exit' ?
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={`Remove ${binding.stateName}`}
                  onPress={() => {
                    onRemoveStateBinding(binding.stateName);
                  }}
                >
                  <Trash2 size={12} />
                </Button>
              : null}
            </div>
          );
        })}
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: sp('sp-02'),
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
            }}
          >
            Modifier Bindings
          </span>
          <Button size="sm" variant="ghost" aria-label="Add modifier" onPress={handleAddModifier}>
            <Plus size={12} />
          </Button>
        </div>

        {modifierBindings.map((binding) => (
          <div
            key={binding.modifierName}
            data-testid="modifier-binding-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${sp('sp-01')} ${sp('sp-02')}`,
              borderBottom: `1px solid ${color('border')}`,
              fontSize: '12px',
              color: color('foreground'),
            }}
          >
            <span>{binding.modifierName}</span>
            <div style={{ display: 'flex', gap: sp('sp-02'), color: color('muted') }}>
              <span>In: {timelineMap.get(binding.inTimelineId)?.name ?? binding.inTimelineId}</span>
              {binding.outTimelineId !== undefined ?
                <span>Out: {timelineMap.get(binding.outTimelineId)?.name ?? binding.outTimelineId}</span>
              : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Remove ${binding.modifierName}`}
              onPress={() => {
                onRemoveModifierBinding(binding.modifierName);
              }}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
