/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClockPanel, TickerPanel, VideoPanel } from './panels';

describe('VideoPanel', () => {
  /** @description VideoPanel must render source URL, autoplay, loop, muted, start/end time controls. */
  it('renders all video controls', () => {
    render(
      <VideoPanel
        sourceUrl="https://example.com/video.mp4"
        autoplay={true}
        loop={false}
        muted={true}
        startTime={5}
        endTime={30}
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /source url/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /autoplay/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /loop/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /muted/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /start time/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /end time/i })).not.toBeNull();
  });

  /** @description Toggling autoplay must fire onUpdate with the boolean value. */
  it('fires onUpdate when autoplay is toggled', () => {
    const onUpdate = vi.fn<(k: string, v: string | number | boolean) => void>();

    render(
      <VideoPanel
        sourceUrl="https://example.com/video.mp4"
        autoplay={false}
        loop={false}
        muted={false}
        startTime={0}
        endTime={0}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: /autoplay/i }));
    expect(onUpdate).toHaveBeenCalledWith('autoplay', true);
  });
});

describe('ClockPanel', () => {
  /** @description ClockPanel must render format, mode, and mode-dependent fields for countdown. */
  it('renders format, mode, and countdown fields', () => {
    render(
      <ClockPanel
        format="HH:mm:ss"
        mode="countdown"
        startValue="00:10:00"
        targetValue="00:00:00"
        countdownTo=""
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /format/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /start value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /target value/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /countdown to/i })).not.toBeNull();
  });

  /** @description In realtime mode, start/target/countdownTo fields must be hidden. */
  it('hides countdown fields in realtime mode', () => {
    render(
      <ClockPanel
        format="HH:mm:ss"
        mode="realtime"
        startValue=""
        targetValue=""
        countdownTo=""
        onUpdate={() => undefined}
      />,
    );

    expect(screen.queryByRole('textbox', { name: /start value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /target value/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /countdown to/i })).toBeNull();
  });
});

describe('TickerPanel', () => {
  /** @description TickerPanel must render items list, speed, direction, gap, paused controls. */
  it('renders all ticker controls', () => {
    render(
      <TickerPanel
        items={['Breaking News', 'Weather Update']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /item 1/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /item 2/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /speed/i })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /gap/i })).not.toBeNull();
    expect(screen.getByRole('switch', { name: /paused/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /add item/i })).not.toBeNull();
  });

  /** @description Adding an item must call onUpdateItems with the new list. */
  it('adds a new item when Add Item is clicked', () => {
    const onUpdateItems = vi.fn<(items: readonly string[]) => void>();

    render(
      <TickerPanel
        items={['Item 1']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={onUpdateItems}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(onUpdateItems).toHaveBeenCalledWith(['Item 1', 'New item']);
  });

  /** @description Last item must not have a remove button. */
  it('hides remove button when only one item exists', () => {
    render(
      <TickerPanel
        items={['Only Item']}
        speed={100}
        direction="left"
        gap={20}
        paused={false}
        onUpdate={() => undefined}
        onUpdateItems={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /remove item/i })).toBeNull();
  });
});
