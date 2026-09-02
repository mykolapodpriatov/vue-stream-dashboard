import { defineStore } from 'pinia';
import { computed, inject, ref, shallowRef, watch } from 'vue';
import type { Quality, WireFrame } from '@/domain/telemetry';
import { computeOrder, type SortDirection, type SortKey } from '@/feed/order';
import { useTelemetryPipeline } from '@/pipeline/useTelemetryPipeline';
import { createLiveSource, type LiveSource } from '@/sources/LiveSource';
import type { Fault } from '@/sources/liveWorkerCore';
import { type PlaybackMode, replaySpeedOf } from '@/sources/playback';
import {
  createSyntheticRecording,
  parseRecording,
  serializeRecording,
  type Recording,
} from '@/sources/recording';
import { createReplaySource, type ReplaySource } from '@/sources/ReplaySource';
import type { StreamSource } from '@/sources/StreamSource';
import { tapSource } from '@/sources/tapSource';
import { downloadText } from '@/utils/download';
import { FEED_DEPS } from './deps';
import { useSettingsStore } from './settings';

/**
 * The four states a feed can be in, and the words for them. They are words
 * first: the UI shows the text, and the icon and colour are decoration on top,
 * so the state survives colour-blindness, a monochrome display and a screen
 * reader.
 */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline' | 'stale';
export type Transport = 'worker' | 'replay' | 'none';

/** How long the bundled demo recording runs before looping. */
const DEMO_RECORDING_MS = 10_000;

/**
 * The feed: one pipeline, one source at a time, and everything the screens
 * need to know about either.
 *
 * Owning the source lifecycle here rather than in a view is what lets the feed
 * keep running while the user navigates — the instrument page shows the same
 * data the table did, because it is the same pipeline.
 */
export const useFeedStore = defineStore('feed', () => {
  const deps = inject(FEED_DEPS, {});
  const settings = useSettingsStore();
  const now = deps.now ?? (() => performance.now());

  const pipeline = useTelemetryPipeline({
    instruments: settings.instruments,
    ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
    now,
  });

  const mode = ref<PlaybackMode>('live');
  const status = ref<ConnectionStatus>('offline');
  const transport = ref<Transport>('none');
  const lastDataAt = ref<number | null>(null);

  // Once per commit, not per event: this watcher runs when the snapshot does.
  watch(pipeline.snapshot, (snapshot) => {
    if (snapshot.updated.length > 0) lastDataAt.value = snapshot.at;
  });

  // ---- recording state (declared early: the source tap reads it) --------

  let capturing = false;
  const recorded: WireFrame[] = [];
  const isRecording = ref(false);
  const recordedCount = ref(0);

  // ---- source lifecycle -------------------------------------------------

  let source: StreamSource<WireFrame> | null = null;
  let live: LiveSource | null = null;
  let replay: ReplaySource | null = null;
  const replayPosition = ref(0);
  const replayTotal = ref(0);
  const started = ref(false);

  /** The recording used for replay modes: uploaded, or generated from the settings. */
  const recording = shallowRef<Recording | null>(null);
  const recordingName = ref<string | null>(null);

  function currentRecording(): Recording {
    if (recording.value) return recording.value;
    const generated = createSyntheticRecording({
      seed: settings.seed,
      instruments: settings.instruments,
      ratePerSecond: settings.ratePerSecond,
      dirtyWire: settings.dirtyWire,
      durationMs: DEMO_RECORDING_MS,
    });
    recording.value = generated;
    return generated;
  }

  function buildSource(target: PlaybackMode): StreamSource<WireFrame> {
    live = null;
    replay = null;
    if (target === 'live') {
      live = createLiveSource({
        config: {
          seed: settings.seed,
          instruments: settings.instruments,
          ratePerSecond: settings.ratePerSecond,
          dirtyWire: settings.dirtyWire,
        },
        ...(deps.createWorker ? { createWorker: deps.createWorker } : {}),
      });
      transport.value = 'worker';
      return live;
    }
    replay = createReplaySource(currentRecording(), {
      speed: replaySpeedOf(target),
      loop: true,
    });
    replayTotal.value = replay.total;
    replayPosition.value = 0;
    transport.value = 'replay';
    return replay;
  }

  /** Start (or restart) the feed in the current mode. */
  function start(): void {
    stop();
    const built = buildSource(mode.value);
    const wrapped = tapSource(built, observeBatch);
    source = wrapped;
    started.value = true;
    status.value = 'connected';
    void pipeline.run(wrapped).then(() => {
      // The source ended on its own — a drop, or a non-looping recording.
      if (source === wrapped) {
        source = null;
        status.value = 'offline';
      }
    });
  }

  function stop(): void {
    source = null;
    live = null;
    replay = null;
    pipeline.stop();
    status.value = 'offline';
    transport.value = 'none';
  }

  /** Once per batch — at most a few dozen times a second — never per event. */
  function observeBatch(batch: readonly WireFrame[]): void {
    if (capturing) {
      recorded.push(...batch);
      recordedCount.value = recorded.length;
    }
    if (replay) replayPosition.value = replay.position;
  }

  function setMode(next: PlaybackMode): void {
    if (next === mode.value) return;
    mode.value = next;
    if (started.value) start();
  }

  function step(): void {
    replay?.step();
  }

  function injectFault(fault: Fault): void {
    live?.inject(fault);
  }

  function setRate(ratePerSecond: number): void {
    settings.ratePerSecond = ratePerSecond;
    live?.setRate(ratePerSecond);
  }

  /** Apply fleet-level settings: new size, seed or wire. Discards readings. */
  function applyFleet(): void {
    recording.value = null;
    recordingName.value = null;
    pipeline.reset(settings.instruments);
    if (started.value) start();
  }

  // ---- recording -------------------------------------------------------

  function startRecording(): void {
    recorded.length = 0;
    capturing = true;
    isRecording.value = true;
    recordedCount.value = 0;
  }

  /** Stop capturing and return what was captured. */
  function stopRecording(): Recording {
    capturing = false;
    isRecording.value = false;
    const captured: Recording = {
      version: 1,
      meta: {
        instruments: settings.instruments,
        seed: settings.seed,
        ratePerSecond: settings.ratePerSecond,
        recordedAt: new Date().toISOString(),
      },
      frames: [...recorded],
    };
    recorded.length = 0;
    recordedCount.value = captured.frames.length;
    return captured;
  }

  function downloadRecording(captured: Recording): void {
    const stamp = (captured.meta.recordedAt ?? new Date().toISOString()).replace(
      /[:.]/g,
      '-',
    );
    downloadText(`recording-${stamp}.json`, serializeRecording(captured));
  }

  /**
   * Replace the replay recording with one from a file and start playing it.
   * Throws `SyntaxError` for anything that is not a recording.
   */
  async function loadRecording(file: Blob & { name?: string }): Promise<Recording> {
    const parsed = parseRecording(await file.text());
    recording.value = parsed;
    recordingName.value = file.name ?? null;
    if (parsed.meta.instruments !== settings.instruments) {
      settings.instruments = parsed.meta.instruments;
      pipeline.reset(parsed.meta.instruments);
    }
    mode.value = '1x';
    if (started.value) start();
    return parsed;
  }

  // ---- ordering ---------------------------------------------------------

  const sortKey = ref<SortKey>('id');
  const sortDirection = ref<SortDirection>('asc');
  const query = ref('');
  const qualityFilter = ref<Quality | 'all'>('all');

  /**
   * Recomputed once per commit (it depends on the snapshot) or when a control
   * changes — and only if something is rendering it.
   */
  const order = computed(() =>
    computeOrder(pipeline.snapshot.value.rows, {
      sortKey: sortKey.value,
      direction: sortDirection.value,
      query: query.value,
      quality: qualityFilter.value,
    }),
  );

  function sortBy(key: SortKey): void {
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey.value = key;
      sortDirection.value = key === 'ts' || key === 'updates' ? 'desc' : 'asc';
    }
  }

  return {
    // pipeline
    snapshot: pipeline.snapshot,
    stats: pipeline.stats,
    paused: pipeline.paused,
    pause: pipeline.pause,
    resume: pipeline.resume,
    // source
    mode,
    status,
    transport,
    lastDataAt,
    started,
    replayPosition,
    replayTotal,
    recordingName,
    start,
    stop,
    setMode,
    step,
    injectFault,
    setRate,
    applyFleet,
    // recording
    isRecording,
    recordedCount,
    startRecording,
    stopRecording,
    downloadRecording,
    loadRecording,
    // ordering
    sortKey,
    sortDirection,
    query,
    qualityFilter,
    order,
    sortBy,
  };
});
