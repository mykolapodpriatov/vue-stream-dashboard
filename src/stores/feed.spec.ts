import { nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createHarness, type Harness } from '../../test/harness';
import { frame } from '../../test/fakeWorker';
import { createSyntheticRecording, serializeRecording } from '@/sources/recording';
import { useFeedStore } from './feed';
import { useSettingsStore } from './settings';

describe('useFeedStore', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
    useSettingsStore().instruments = 50;
  });

  it('starts live against a worker and reports connected', () => {
    const feed = useFeedStore();
    expect(feed.status).toBe('offline');
    feed.start();
    expect(feed.status).toBe('connected');
    expect(feed.transport).toBe('worker');
    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]!.commands[0]).toMatchObject({
      type: 'start',
      config: { instruments: 50, seed: 2026, ratePerSecond: 5_000 },
    });
  });

  it('commits worker batches to the snapshot once per frame', async () => {
    const feed = useFeedStore();
    feed.start();
    const worker = h.workers[0]!;
    worker.emitBatch([frame(0, 3, 21.5), frame(1, 7, 3)]);
    worker.emitBatch([frame(2, 3, 22)]);
    await flushPromises();
    expect(feed.snapshot.frame).toBe(0);

    h.scheduler.tick(16);
    expect(feed.snapshot.frame).toBe(1);
    expect(feed.snapshot.rows[3]!.value).toBe(22);
    expect(feed.snapshot.rows[3]!.updates).toBe(2);
    expect(feed.stats.accepted).toBe(3);
    await nextTick();
    expect(feed.lastDataAt).toBe(16);
  });

  it('switching to a replay mode swaps the transport and the source', () => {
    const feed = useFeedStore();
    feed.start();
    feed.setMode('10x');
    expect(feed.mode).toBe('10x');
    expect(feed.transport).toBe('replay');
    expect(feed.replayTotal).toBeGreaterThan(0);
    expect(h.workers[0]!.terminated).toBe(1);
  });

  it('step mode advances one batch per step()', async () => {
    const feed = useFeedStore();
    feed.setMode('step');
    feed.start();
    await flushPromises();
    expect(feed.replayPosition).toBe(0);
    feed.step();
    await flushPromises();
    expect(feed.replayPosition).toBe(1);
    h.scheduler.tick();
    expect(feed.stats.accepted).toBeGreaterThan(0);
  });

  it('a drop fault takes the feed offline; start() brings it back', async () => {
    const feed = useFeedStore();
    feed.start();
    feed.injectFault('drop');
    await flushPromises();
    expect(feed.status).toBe('offline');
    feed.start();
    expect(feed.status).toBe('connected');
    expect(h.workers).toHaveLength(2);
  });

  it('forwards rate changes to the live worker and the settings', () => {
    const feed = useFeedStore();
    feed.start();
    feed.setRate(20_000);
    expect(useSettingsStore().ratePerSecond).toBe(20_000);
    expect(h.workers[0]!.commands.at(-1)).toEqual({
      type: 'configure',
      ratePerSecond: 20_000,
    });
  });

  it('records the frames the pipeline sees', async () => {
    const feed = useFeedStore();
    feed.start();
    feed.startRecording();
    expect(feed.isRecording).toBe(true);
    h.workers[0]!.emitBatch([frame(0, 1, 1), frame(1, 2, 2)]);
    h.workers[0]!.emitBatch([frame(2, 3, 3)]);
    await flushPromises();
    expect(feed.recordedCount).toBe(3);
    const captured = feed.stopRecording();
    expect(captured.frames).toHaveLength(3);
    expect(captured.meta).toMatchObject({ instruments: 50, seed: 2026 });
    expect(feed.isRecording).toBe(false);
  });

  it('loads a recording, adopts its fleet and switches to 1x', async () => {
    const feed = useFeedStore();
    feed.start();
    const recording = createSyntheticRecording({
      seed: 5,
      instruments: 12,
      ratePerSecond: 500,
      durationMs: 200,
    });
    const file = new Blob([serializeRecording(recording)], { type: 'application/json' });
    const loaded = await feed.loadRecording(
      Object.assign(file, { name: 'session.json' }),
    );
    expect(loaded.frames.length).toBe(recording.frames.length);
    expect(feed.mode).toBe('1x');
    expect(feed.recordingName).toBe('session.json');
    expect(useSettingsStore().instruments).toBe(12);
    expect(feed.snapshot.rows).toHaveLength(12);
    expect(feed.transport).toBe('replay');
  });

  it('rejects a file that is not a recording', async () => {
    const feed = useFeedStore();
    await expect(feed.loadRecording(new Blob(['{"nope":true}']))).rejects.toThrow(
      SyntaxError,
    );
  });

  it('applyFleet resets readings and restarts with the new size', () => {
    const feed = useFeedStore();
    feed.start();
    useSettingsStore().instruments = 20;
    feed.applyFleet();
    expect(feed.snapshot.rows).toHaveLength(20);
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1]!.commands[0]).toMatchObject({ config: { instruments: 20 } });
  });

  it('sortBy toggles direction on the same key and picks a sensible default otherwise', () => {
    const feed = useFeedStore();
    expect(feed.order).toEqual(Array.from({ length: 50 }, (_, i) => i));
    feed.sortBy('value');
    expect(feed.sortKey).toBe('value');
    expect(feed.sortDirection).toBe('asc');
    feed.sortBy('value');
    expect(feed.sortDirection).toBe('desc');
    feed.sortBy('updates');
    expect(feed.sortDirection).toBe('desc');
    feed.sortBy('id');
    feed.sortBy('id');
    expect(feed.order[0]).toBe(49);
  });

  it('stop() closes the source and reports offline', () => {
    const feed = useFeedStore();
    feed.start();
    feed.stop();
    expect(feed.status).toBe('offline');
    expect(feed.transport).toBe('none');
    expect(h.workers[0]!.terminated).toBe(1);
  });
});
