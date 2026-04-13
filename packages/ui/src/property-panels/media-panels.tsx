import { Button, Input, Switch } from '@heroui/react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { DragEvent as ReactDragEvent, JSX } from 'react';
import { useState } from 'react';

import { CLOCK_MODES, FieldShell, ICON_SIZE, NumericField, SelectField, TICKER_DIRECTIONS } from '../panel-types';
import { sp } from '../tokens';

export interface VideoPanelProps {
  readonly sourceUrl: string;
  readonly autoplay: boolean;
  readonly loop: boolean;
  readonly muted: boolean;
  readonly startTime: number;
  readonly endTime: number;
  readonly onUpdate: (key: string, value: string | number | boolean) => void;
}

export function VideoPanel({
  sourceUrl,
  autoplay,
  loop,
  muted,
  startTime,
  endTime,
  onUpdate,
}: VideoPanelProps): JSX.Element {
  return (
    <section aria-label="Video" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Source URL">
        <Input
          aria-label="Source URL"
          value={sourceUrl}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <Switch
        aria-label="Autoplay"
        isSelected={autoplay}
        onChange={(v) => {
          onUpdate('autoplay', v);
        }}
      >
        Autoplay
      </Switch>
      <Switch
        aria-label="Loop"
        isSelected={loop}
        onChange={(v) => {
          onUpdate('loop', v);
        }}
      >
        Loop
      </Switch>
      <Switch
        aria-label="Muted"
        isSelected={muted}
        onChange={(v) => {
          onUpdate('muted', v);
        }}
      >
        Muted
      </Switch>
      <NumericField
        label="Start Time (s)"
        minValue={0}
        value={startTime}
        onValueChange={(v) => {
          onUpdate('startTime', v);
        }}
      />
      <NumericField
        label="End Time (s)"
        minValue={0}
        value={endTime}
        onValueChange={(v) => {
          onUpdate('endTime', v);
        }}
      />
    </section>
  );
}

export interface ClockPanelProps {
  readonly format: string;
  readonly mode: string;
  readonly startValue: string;
  readonly targetValue: string;
  readonly countdownTo: string;
  readonly onUpdate: (key: string, value: string) => void;
}

export function ClockPanel({
  format,
  mode,
  startValue,
  targetValue,
  countdownTo,
  onUpdate,
}: ClockPanelProps): JSX.Element {
  const isCountdown = mode === 'countdown';
  const isCountdownOrCountup = mode === 'countdown' || mode === 'countup' || mode === 'stopwatch';
  const hasAbsoluteCountdown = isCountdown && countdownTo !== '';

  return (
    <section aria-label="Clock" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Format">
        <Input
          aria-label="Format"
          value={format}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldShell>
      <SelectField
        label="Mode"
        options={[...CLOCK_MODES]}
        updateKey="mode"
        value={mode}
        onUpdate={(_key, value) => {
          onUpdate('mode', String(value));
        }}
      />
      {isCountdownOrCountup && !hasAbsoluteCountdown ?
        <FieldShell label="Start Value">
          <Input
            aria-label="Start Value"
            value={startValue}
            onChange={(e) => {
              onUpdate('startValue', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
      {isCountdown && !hasAbsoluteCountdown ?
        <FieldShell label="Target Value">
          <Input
            aria-label="Target Value"
            value={targetValue}
            onChange={(e) => {
              onUpdate('targetValue', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
      {isCountdown ?
        <FieldShell label="Countdown To">
          <Input
            aria-label="Countdown To"
            value={countdownTo}
            onChange={(e) => {
              onUpdate('countdownTo', e.currentTarget.value);
            }}
          />
        </FieldShell>
      : null}
    </section>
  );
}

export interface TickerPanelProps {
  readonly items: readonly string[];
  readonly speed: number;
  readonly direction: string;
  readonly gap: number;
  readonly paused: boolean;
  readonly onUpdate: (key: string, value: string | number | boolean) => void;
  readonly onUpdateItems: (items: readonly string[]) => void;
}

export function TickerPanel({
  items,
  speed,
  direction,
  gap,
  paused,
  onUpdate,
  onUpdateItems,
}: TickerPanelProps): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleItemDragStart(e: ReactDragEvent<HTMLDivElement>, index: number): void {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';

    const ghost = document.createElement('canvas');

    ghost.width = 1;
    ghost.height = 1;
    e.dataTransfer.setDragImage(ghost, 0, 0);
  }

  function handleItemDragOver(e: ReactDragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleItemDrop(targetIndex: number): void {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);

      return;
    }

    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);

    if (moved !== undefined) {
      reordered.splice(targetIndex, 0, moved);
      onUpdateItems(reordered);
    }

    setDragIndex(null);
  }

  return (
    <section aria-label="Ticker" role="region" className="grid grid-cols-1 gap-2">
      <FieldShell label="Items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
          {items.map((item, index) => (
            <div
              key={`${String(index)}-${item}`}
              draggable
              style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02') }}
              onDragOver={handleItemDragOver}
              onDragStart={(e) => {
                handleItemDragStart(e, index);
              }}
              onDrop={() => {
                handleItemDrop(index);
              }}
            >
              <span
                aria-label={`Drag item ${String(index + 1)}`}
                style={{ alignItems: 'center', cursor: 'grab', display: 'flex' }}
              >
                <GripVertical size={ICON_SIZE} />
              </span>
              <Input
                aria-label={`Item ${String(index + 1)}`}
                value={item}
                onChange={(e) => {
                  const updated = items.map((existing, itemIndex) =>
                    itemIndex === index ? e.currentTarget.value : existing,
                  );

                  onUpdateItems(updated);
                }}
              />
              {items.length > 1 ?
                <Button
                  aria-label={`Remove item ${String(index + 1)}`}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onUpdateItems(items.filter((_value, itemIndex) => itemIndex !== index));
                  }}
                >
                  <Trash2 size={ICON_SIZE} />
                </Button>
              : null}
            </div>
          ))}
          <Button
            aria-label="Add Item"
            size="sm"
            variant="ghost"
            onPress={() => {
              onUpdateItems([...items, 'New item']);
            }}
          >
            <Plus size={ICON_SIZE} /> Add Item
          </Button>
        </div>
      </FieldShell>
      <NumericField
        label="Speed (px/s)"
        maxValue={2000}
        minValue={1}
        value={speed}
        onValueChange={(v) => {
          onUpdate('speed', v);
        }}
      />
      <SelectField
        label="Direction"
        options={[...TICKER_DIRECTIONS]}
        updateKey="direction"
        value={direction}
        onUpdate={(key, value) => {
          onUpdate(key, value);
        }}
      />
      <NumericField
        label="Gap (px)"
        minValue={0}
        value={gap}
        onValueChange={(v) => {
          onUpdate('gap', v);
        }}
      />
      <Switch
        aria-label="Paused"
        isSelected={paused}
        onChange={(v) => {
          onUpdate('paused', v);
        }}
      >
        Paused
      </Switch>
    </section>
  );
}
