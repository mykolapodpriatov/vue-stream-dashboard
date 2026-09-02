import { describe, expect, it } from 'vitest';
import type { WorkerLike } from './LiveSource';
import {
  createSourceForMode,
  isPlaybackMode,
  PLAYBACK_MODES,
  replaySpeedOf,
} from './playback';
import { createSyntheticRecording } from './recording';

const recording = createSyntheticRecording({
  seed: 1,
  instruments: 3,
  ratePerSecond: 100,
  durationMs: 100,
});

const worker: WorkerLike = {
  postMessage: () => {},
  terminate: () => {},
  onmessage: null,
  onerror: null,
};

describe('playback modes', () => {
  it('recognises exactly the five modes', () => {
    expect(PLAYBACK_MODES).toEqual(['live', '1x', '10x', '100x', 'step']);
    expect(isPlaybackMode('10x')).toBe(true);
    expect(isPlaybackMode('2x')).toBe(false);
    expect(isPlaybackMode(undefined)).toBe(false);
  });

  it('maps replay modes to speeds', () => {
    expect(replaySpeedOf('1x')).toBe(1);
    expect(replaySpeedOf('10x')).toBe(10);
    expect(replaySpeedOf('100x')).toBe(100);
    expect(replaySpeedOf('step')).toBe('step');
  });

  it('builds a live source for live and a replay source otherwise', () => {
    const options = {
      live: {
        config: { seed: 1, instruments: 3, ratePerSecond: 100 },
        createWorker: () => worker,
      },
      recording,
    };
    const live = createSourceForMode('live', options);
    const replay = createSourceForMode('step', options);
    expect('inject' in live).toBe(true);
    expect('step' in replay).toBe(true);
    live.close();
    replay.close();
  });
});
