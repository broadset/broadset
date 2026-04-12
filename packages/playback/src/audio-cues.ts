import type { Timeline } from '@broadset/model';

/**
 * A read-only fired cue result returned from the engine's advance() method.
 * Consumers use this to trigger actual audio playback.
 */
export interface FiredAudioCue {
  readonly assetId: string;
  readonly volume: number;
  readonly loop: boolean;
}

/**
 * AudioCueEngine tracks which audio cues have fired per timeline
 * and provides fire-and-forget semantics.
 *
 * Cues fire only during forward playback through their offsetMs.
 * Seeking past a cue does not fire it.
 * Seeking backward past a fired cue resets it so it can fire again on forward play.
 */
export interface AudioCueEngine {
  /**
   * Advance forward playback from previousTimeMs to currentTimeMs.
   * Returns cues whose offsetMs falls within [previousTimeMs, currentTimeMs).
   * Marks returned cues as fired.
   */
  advance(timeline: Timeline, previousTimeMs: number, currentTimeMs: number): readonly FiredAudioCue[];

  /**
   * Seek to a specific time without firing cues.
   * Resets fired state for all cues, then marks cues at or before seekTimeMs
   * as already fired (preventing spurious fire on subsequent advance).
   * Cues after seekTimeMs remain unfired so they can fire during future forward play.
   */
  seek(timeline: Timeline, seekTimeMs: number): void;

  /**
   * Reset all fired state across all timelines.
   */
  reset(): void;
}

export function createAudioCueEngine(): AudioCueEngine {
  // Map from timeline ID to set of cue offsets that have been fired
  const firedCues = new Map<string, Set<number>>();

  function getFiredSet(timelineId: string): Set<number> {
    let set = firedCues.get(timelineId);

    if (set === undefined) {
      set = new Set<number>();
      firedCues.set(timelineId, set);
    }

    return set;
  }

  return {
    advance(timeline: Timeline, previousTimeMs: number, currentTimeMs: number): readonly FiredAudioCue[] {
      const cues = timeline.audioCues;

      if (cues === undefined || cues.length === 0) {
        return [];
      }

      // Only fire during forward playback
      if (currentTimeMs <= previousTimeMs) {
        return [];
      }

      const fired = getFiredSet(timeline.id);
      const result: FiredAudioCue[] = [];

      for (const cue of cues) {
        if (fired.has(cue.offsetMs)) {
          continue;
        }

        // Cue fires when its offset is within the advance range [previousTimeMs, currentTimeMs)
        const inRange = cue.offsetMs >= previousTimeMs && cue.offsetMs < currentTimeMs;

        if (inRange) {
          fired.add(cue.offsetMs);
          result.push({
            assetId: cue.assetId,
            volume: cue.volume,
            loop: cue.loop,
          });
        }
      }

      return result;
    },

    seek(timeline: Timeline, seekTimeMs: number): void {
      const fired = getFiredSet(timeline.id);

      // Clear fired state for cues after seekTimeMs (so they can re-fire)
      // Mark cues at or before seekTimeMs as fired (so they don't spuriously fire)
      fired.clear();

      const cues = timeline.audioCues;

      if (cues === undefined) {
        return;
      }

      for (const cue of cues) {
        if (cue.offsetMs <= seekTimeMs) {
          fired.add(cue.offsetMs);
        }
      }
    },

    reset(): void {
      firedCues.clear();
    },
  };
}
