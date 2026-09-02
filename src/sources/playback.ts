import type { WireFrame } from '@/domain/telemetry';
import { createLiveSource, type LiveSourceOptions } from './LiveSource';
import type { Recording } from './recording';
import {
  createReplaySource,
  type ReplaySourceOptions,
  type ReplaySpeed,
} from './ReplaySource';
import type { StreamSource } from './StreamSource';

/**
 * Every way the dashboard can be fed. One is live; the other four replay a
 * recording at a different pace. They are one list because the UI presents
 * them as one control, and switching between them must feel like changing a
 * speed, not changing an application.
 */
export const PLAYBACK_MODES = ['live', '1x', '10x', '100x', 'step'] as const;
export type PlaybackMode = (typeof PLAYBACK_MODES)[number];

export function isPlaybackMode(value: unknown): value is PlaybackMode {
  return (PLAYBACK_MODES as readonly unknown[]).includes(value);
}

export function replaySpeedOf(mode: Exclude<PlaybackMode, 'live'>): ReplaySpeed {
  switch (mode) {
    case '1x':
      return 1;
    case '10x':
      return 10;
    case '100x':
      return 100;
    case 'step':
      return 'step';
  }
}

export interface SourceFactoryOptions {
  readonly live: LiveSourceOptions;
  readonly recording: Recording;
  readonly replay?: Omit<ReplaySourceOptions, 'speed'>;
}

/** Build the source for a mode. The caller owns closing it. */
export function createSourceForMode(
  mode: PlaybackMode,
  options: SourceFactoryOptions,
): StreamSource<WireFrame> {
  if (mode === 'live') return createLiveSource(options.live);
  return createReplaySource(options.recording, {
    ...options.replay,
    speed: replaySpeedOf(mode),
  });
}
