import type { BroadsetScreenProps } from '@broadset/model';
import { createDefaultScreenProps } from '@broadset/model';
import { describe, expect, it, jest } from '@jest/globals';

import type { PlaybackControllerRef, ScreenStateApplicator } from './timeline-playback';
import { TimelinePlaybackCoordinator } from './timeline-playback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockController(): PlaybackControllerRef {
  return {
    seekTimeline: jest.fn(),
    stopTimeline: jest.fn(),
  };
}

function mockApplicator(elements: ReadonlyArray<{ id: string; screen: BroadsetScreenProps }>): ScreenStateApplicator {
  return {
    apply: jest.fn(),
    getElements: jest.fn<() => ReadonlyArray<{ id: string; screen: BroadsetScreenProps }>>().mockReturnValue(elements),
  };
}

function makeElement(
  id: string,
  overrides?: Partial<BroadsetScreenProps>,
): { id: string; screen: BroadsetScreenProps } {
  return { id, screen: { ...createDefaultScreenProps(), ...overrides } };
}

// ---------------------------------------------------------------------------
// Playback Controller Registration
// ---------------------------------------------------------------------------

describe('Playback Controller Registration', () => {
  /** @description When a controller is reported as ready, subsequent playback actions use that reference. */
  it('stores controller reference on ready callback', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const applicator = mockApplicator([makeElement('el-1')]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);
    coordinator.play(applicator);

    expect(controller.seekTimeline).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Snapshot Restore Before Play and Seek
// ---------------------------------------------------------------------------

describe('Snapshot Restore Before Play and Seek', () => {
  /** @description Play restores the captured snapshot before delegating timeline play. */
  it('restores snapshot before play', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const el = makeElement('el-1', { visibility: 'offscreen' });
    const applicator = mockApplicator([el]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);

    // Simulate element screen change after snapshot capture
    const changedApplicator = mockApplicator([makeElement('el-1', { visibility: 'onscreen' })]);

    coordinator.play(changedApplicator);

    // Snapshot should be restored (original offscreen state applied)
    expect(changedApplicator.apply).toHaveBeenCalledWith('el-1', expect.objectContaining({ visibility: 'offscreen' }));
  });

  /** @description Seek restores the captured snapshot before delegating timeline seek. */
  it('restores snapshot before seek', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const el = makeElement('el-1', { visibility: 'offscreen' });
    const applicator = mockApplicator([el]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);

    const changedApplicator = mockApplicator([makeElement('el-1', { visibility: 'onscreen' })]);

    coordinator.seek(500, changedApplicator);

    // Snapshot should be restored
    expect(changedApplicator.apply).toHaveBeenCalledWith('el-1', expect.objectContaining({ visibility: 'offscreen' }));
    // And seek delegated
    expect(controller.seekTimeline).toHaveBeenCalledWith('el-1', 'fadeIn', 500);
  });
});

// ---------------------------------------------------------------------------
// Timeline Stop Delegation
// ---------------------------------------------------------------------------

describe('Timeline Stop Delegation', () => {
  /** @description Stop request is delegated to the playback controller. */
  it('delegates stop to the playback controller', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const applicator = mockApplicator([makeElement('el-1')]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);
    coordinator.stop();

    expect(controller.stopTimeline).toHaveBeenCalledWith('el-1', 'fadeIn');
  });
});

// ---------------------------------------------------------------------------
// Editing-Close Restoration
// ---------------------------------------------------------------------------

describe('Editing-Close Restoration', () => {
  /** @description Closing editing stops the timeline and restores the snapshot. */
  it('stops timeline and restores snapshot on close', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const el = makeElement('el-1', { visibility: 'offscreen' });
    const applicator = mockApplicator([el]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);

    const closeApplicator = mockApplicator([makeElement('el-1', { visibility: 'onscreen' })]);

    coordinator.closeEditing(closeApplicator);

    // Timeline should be stopped
    expect(controller.stopTimeline).toHaveBeenCalledWith('el-1', 'fadeIn');
    // Snapshot should be restored
    expect(closeApplicator.apply).toHaveBeenCalledWith('el-1', expect.objectContaining({ visibility: 'offscreen' }));
  });
});

// ---------------------------------------------------------------------------
// Graceful No-Controller Behavior
// ---------------------------------------------------------------------------

describe('Graceful No-Controller Behavior', () => {
  /** @description Play with no controller does nothing and does not mutate screen state. */
  it('no-ops playback actions when no controller is registered', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const applicator = mockApplicator([makeElement('el-1')]);

    // No controller registered — play should not throw or apply anything
    coordinator.openEditing('el-1', 'fadeIn', applicator);
    coordinator.play(applicator);

    expect(applicator.apply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Transition Suppression Timing
// ---------------------------------------------------------------------------

describe('Transition Suppression Timing', () => {
  /** @description Suppression is enabled during restore mutations for play and disabled after. */
  it('wraps play restore window with suppression', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const suppressionLog: boolean[] = [];

    coordinator.onSuppressChange((suppressed) => {
      suppressionLog.push(suppressed);
    });

    const el = makeElement('el-1');
    const applicator = mockApplicator([el]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);
    coordinator.play(applicator);

    // Expect: true (suppress on), then false (suppress off)
    expect(suppressionLog).toEqual([true, false]);
  });

  /** @description Suppression wraps seek restore window. */
  it('wraps seek restore window with suppression', () => {
    const coordinator = new TimelinePlaybackCoordinator();
    const controller = mockController();
    const suppressionLog: boolean[] = [];

    coordinator.onSuppressChange((suppressed) => {
      suppressionLog.push(suppressed);
    });

    const el = makeElement('el-1');
    const applicator = mockApplicator([el]);

    coordinator.onReady(controller);
    coordinator.openEditing('el-1', 'fadeIn', applicator);
    coordinator.seek(500, applicator);

    expect(suppressionLog).toEqual([true, false]);
  });
});
