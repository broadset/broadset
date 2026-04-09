import { describe, expect, it, jest } from '@jest/globals';

import { createTimelinePlaybackCoordinator } from './timeline-playback';

interface MockController {
  readonly play: jest.Mock;
  readonly pause: jest.Mock;
  readonly seek: jest.Mock;
  readonly seekTimeline: jest.Mock;
  readonly stopTimeline: jest.Mock;
  readonly setSpeed: jest.Mock;
  readonly setRegistry: jest.Mock;
  readonly attach: jest.Mock;
  readonly detach: jest.Mock;
  readonly destroy: jest.Mock;
}

function createMockController(): MockController {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    seek: jest.fn(),
    seekTimeline: jest.fn().mockReturnValue(null),
    stopTimeline: jest.fn(),
    setSpeed: jest.fn(),
    setRegistry: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn(),
    destroy: jest.fn(),
  };
}

describe('timeline-playback coordinator', () => {
  describe('Playback Controller Registration', () => {
    /** @description Registering a controller stores the reference for subsequent playback actions. */
    it('uses registered controller for play actions', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();

      coordinator.registerController(controller);
      coordinator.play('el-1', 'tl-1');

      expect(controller.seekTimeline).toHaveBeenCalled();
    });
  });

  describe('Snapshot Restore Before Play and Seek', () => {
    /** @description Play restores the captured animation snapshot before delegating to the controller. */
    it('restores snapshot before play', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { x: 10, y: 20 } };

      coordinator.registerController(controller);
      coordinator.setSnapshot(snapshot);

      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);
      coordinator.play('el-1', 'tl-1');

      expect(restoreCallback).toHaveBeenCalledWith(snapshot);
    });

    /** @description Seek restores the captured animation snapshot before delegating to the controller. */
    it('restores snapshot before seek', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { x: 10, y: 20 } };

      coordinator.registerController(controller);
      coordinator.setSnapshot(snapshot);

      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);
      coordinator.seek('el-1', 'tl-1', 500);

      expect(restoreCallback).toHaveBeenCalledWith(snapshot);
      expect(controller.seekTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ elementId: 'el-1', timelineId: 'tl-1', timeMs: 500 }),
      );
    });
  });

  describe('Timeline Stop Delegation', () => {
    /** @description Stop delegates to the controller for the targeted element/timeline. */
    it('delegates stop to the playback controller', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();

      coordinator.registerController(controller);
      coordinator.stop('el-1', 'tl-1');

      expect(controller.stopTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ elementId: 'el-1', timelineId: 'tl-1' }),
      );
    });
  });

  describe('Editing-Close Restoration', () => {
    /** @description Closing the editing context stops the timeline and restores the snapshot. */
    it('stops timeline and restores snapshot on close', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { opacity: 1 } };

      coordinator.registerController(controller);
      coordinator.setSnapshot(snapshot);
      coordinator.setEditingTarget('el-1', 'tl-1');

      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);
      coordinator.closeEditing();

      expect(controller.stopTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ elementId: 'el-1', timelineId: 'tl-1' }),
      );
      expect(restoreCallback).toHaveBeenCalledWith(snapshot);
    });

    /** @description After closing editing, editing target and snapshot are cleared. */
    it('clears editing target and snapshot after close', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();

      coordinator.registerController(controller);
      coordinator.setSnapshot({ elementId: 'el-1', properties: {} });
      coordinator.setEditingTarget('el-1', 'tl-1');
      coordinator.closeEditing();

      // Second close should be no-op (no target)
      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);
      coordinator.closeEditing();

      expect(restoreCallback).not.toHaveBeenCalled();
    });
  });

  describe('Graceful No-Controller Behavior', () => {
    /** @description Play with no registered controller does nothing and does not mutate state. */
    it('no-ops play when no controller is registered', () => {
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { x: 0 } };

      coordinator.setSnapshot(snapshot);

      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);

      // Should not throw or call restore
      coordinator.play('el-1', 'tl-1');

      expect(restoreCallback).not.toHaveBeenCalled();
    });

    /** @description Seek with no controller does nothing. */
    it('no-ops seek when no controller is registered', () => {
      const coordinator = createTimelinePlaybackCoordinator();

      const restoreCallback = jest.fn();

      coordinator.onRestore(restoreCallback);

      coordinator.seek('el-1', 'tl-1', 1000);

      expect(restoreCallback).not.toHaveBeenCalled();
    });

    /** @description Stop with no controller does nothing. */
    it('no-ops stop when no controller is registered', () => {
      const coordinator = createTimelinePlaybackCoordinator();

      // Should not throw
      coordinator.stop('el-1', 'tl-1');
    });
  });

  describe('Transition Suppression Timing', () => {
    /** @description Suppression is enabled during play restore window and disabled after. */
    it('enables and disables suppression around play restore', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { x: 0 } };

      coordinator.registerController(controller);
      coordinator.setSnapshot(snapshot);

      const suppressionLog: boolean[] = [];

      coordinator.onSuppression((enabled) => {
        suppressionLog.push(enabled);
      });

      coordinator.play('el-1', 'tl-1');

      // Suppression should be enabled then disabled
      expect(suppressionLog).toEqual([true, false]);
    });

    /** @description Suppression is enabled during seek restore window and disabled after. */
    it('enables and disables suppression around seek restore', () => {
      const controller = createMockController();
      const coordinator = createTimelinePlaybackCoordinator();
      const snapshot = { elementId: 'el-1', properties: { x: 0 } };

      coordinator.registerController(controller);
      coordinator.setSnapshot(snapshot);

      const suppressionLog: boolean[] = [];

      coordinator.onSuppression((enabled) => {
        suppressionLog.push(enabled);
      });

      coordinator.seek('el-1', 'tl-1', 250);

      expect(suppressionLog).toEqual([true, false]);
    });
  });
});
