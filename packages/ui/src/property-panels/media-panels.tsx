import { Button, Input } from '@heroui/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { DragEvent as ReactDragEvent, JSX } from 'react';
import { useState } from 'react';

import { FieldRow, NumField, ToggleRow, ToggleSwitch } from '../inputs';
import { CLOCK_MODES, FieldShell, ICON_SIZE, SelectField, TICKER_DIRECTIONS } from '../panel-types';
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
    <section
      aria-label="Video"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Source URL">
        <Input
          aria-label="Source URL"
          value={sourceUrl}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldRow>

      <FieldRow label="Playback">
        <div
          role="group"
          aria-label="Playback flags"
          style={{ display: 'flex', flexWrap: 'wrap', gap: sp('sp-03'), minWidth: 0 }}
        >
          <ToggleSwitch
            ariaLabel="Autoplay"
            isSelected={autoplay}
            onChange={(v) => {
              onUpdate('autoplay', v);
            }}
          >
            Autoplay
          </ToggleSwitch>
          <ToggleSwitch
            ariaLabel="Loop"
            isSelected={loop}
            onChange={(v) => {
              onUpdate('loop', v);
            }}
          >
            Loop
          </ToggleSwitch>
          <ToggleSwitch
            ariaLabel="Muted"
            isSelected={muted}
            onChange={(v) => {
              onUpdate('muted', v);
            }}
          >
            Muted
          </ToggleSwitch>
        </div>
      </FieldRow>

      <FieldRow label="Trim" unit="s">
        <div
          style={{
            display: 'grid',
            gap: sp('sp-02'),
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <NumField
            compact
            label="Start Time (s)"
            min={0}
            value={startTime}
            onChange={(v) => {
              onUpdate('startTime', v);
            }}
          />
          <NumField
            compact
            label="End Time (s)"
            min={0}
            value={endTime}
            onChange={(v) => {
              onUpdate('endTime', v);
            }}
          />
        </div>
      </FieldRow>
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
    <section
      aria-label="Clock"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Format">
        <Input
          aria-label="Format"
          value={format}
          onChange={(e) => {
            onUpdate('content', e.currentTarget.value);
          }}
        />
      </FieldRow>

      <FieldRow label="Mode">
        <SelectField
          hideLabel
          label="Mode"
          options={[...CLOCK_MODES]}
          updateKey="mode"
          value={mode}
          onUpdate={(_key, value) => {
            onUpdate('mode', String(value));
          }}
        />
      </FieldRow>

      {(isCountdownOrCountup && !hasAbsoluteCountdown) || isCountdown ?
        <FieldRow label="Values">
          <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0 }}>
            {isCountdownOrCountup && !hasAbsoluteCountdown ?
              <FieldShell label="Start value">
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
              <FieldShell label="Target value">
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
              <FieldShell label="Countdown to">
                <Input
                  aria-label="Countdown To"
                  value={countdownTo}
                  onChange={(e) => {
                    onUpdate('countdownTo', e.currentTarget.value);
                  }}
                />
              </FieldShell>
            : null}
          </div>
        </FieldRow>
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

function tickerDirectionIcon(dir: (typeof TICKER_DIRECTIONS)[number]): JSX.Element {
  if (dir === 'left') return <ArrowLeft size={ICON_SIZE} />;
  if (dir === 'right') return <ArrowRight size={ICON_SIZE} />;
  if (dir === 'up') return <ArrowUp size={ICON_SIZE} />;

  return <ArrowDown size={ICON_SIZE} />;
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
    <section
      aria-label="Ticker"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04'), minWidth: 0, width: '100%' }}
    >
      <FieldRow label="Items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: 0 }}>
          {items.map((item, index) => (
            <div
              key={`${String(index)}-${item}`}
              draggable
              style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02'), minWidth: 0 }}
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
            style={{ alignSelf: 'flex-start' }}
            onPress={() => {
              onUpdateItems([...items, 'New item']);
            }}
          >
            <Plus size={ICON_SIZE} /> Add item
          </Button>
        </div>
      </FieldRow>

      <FieldRow label="Motion">
        <div
          style={{
            display: 'grid',
            gap: sp('sp-02'),
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <NumField
            compact
            label="Speed (px/s)"
            min={1}
            max={2000}
            value={speed}
            onChange={(v) => {
              onUpdate('speed', v);
            }}
          />
          <NumField
            compact
            label="Gap (px)"
            min={0}
            value={gap}
            onChange={(v) => {
              onUpdate('gap', v);
            }}
          />
        </div>
      </FieldRow>

      <FieldRow label="Direction">
        <ToggleRow
          ariaLabel="Direction"
          mutuallyExclusive
          items={TICKER_DIRECTIONS.map((dir) => ({
            value: dir,
            ariaLabel: `Direction ${dir}`,
            icon: tickerDirectionIcon(dir),
            isActive: direction === dir,
          }))}
          onChange={(nextValue) => {
            onUpdate('direction', nextValue);
          }}
        />
      </FieldRow>

      <FieldRow label="Playback">
        <ToggleSwitch
          ariaLabel="Paused"
          isSelected={paused}
          onChange={(v) => {
            onUpdate('paused', v);
          }}
        >
          Paused
        </ToggleSwitch>
      </FieldRow>
    </section>
  );
}
