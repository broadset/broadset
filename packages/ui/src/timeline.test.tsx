/** @jest-environment jsdom */

import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import { TimelineEditingProvider, useTimelineEditing } from './timeline';

/**
 * @description Verifies the timeline editing provider exposes the minimal state needed by the demo shell.
 */
describe('TimelineEditingProvider', () => {
  /**
   * @description Guards the optional-consumer contract so components can safely check for timeline context.
   */
  it('returns null when used outside the provider', () => {
    let contextValue: ReturnType<typeof useTimelineEditing> = null;

    function Consumer(): React.JSX.Element {
      contextValue = useTimelineEditing();

      return <div>consumer</div>;
    }

    render(<Consumer />);

    expect(contextValue).toBeNull();
  });

  /**
   * @description Ensures opening and closing a timeline updates the shared context state for the demo shell.
   */
  it('opens and closes a timeline target with its snapshot', () => {
    const contextRef: { current: ReturnType<typeof useTimelineEditing> } = { current: null };

    function Consumer(): React.JSX.Element {
      contextRef.current = useTimelineEditing();

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.openTimeline('el-1', 'fade-in', new Map([['opacity', 1]]));
            }}
          >
            Open timeline
          </button>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.closeTimeline();
            }}
          >
            Close timeline
          </button>
        </div>
      );
    }

    render(
      <TimelineEditingProvider>
        <Consumer />
      </TimelineEditingProvider>,
    );

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open timeline/i }));

    expect(contextRef.current?.target).toEqual({ elementId: 'el-1', timelineName: 'fade-in' });
    expect(contextRef.current?.snapshot).toEqual(new Map([['opacity', 1]]));

    fireEvent.click(screen.getByRole('button', { name: /close timeline/i }));

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();
  });
});
