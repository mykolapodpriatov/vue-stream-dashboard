import { describe, expect, it, vi } from 'vitest';
import type { WireFrame } from '@/domain/telemetry';
import { createLiveSource, type WorkerLike } from './LiveSource';
import type { WorkerCommand, WorkerEvent } from './liveWorkerCore';

/** A worker the test plays the part of. */
function fakeWorker() {
  const commands: WorkerCommand[] = [];
  const worker: WorkerLike & { emit(event: WorkerEvent): void; terminated: number } = {
    terminated: 0,
    onmessage: null,
    onerror: null,
    postMessage: (command) => {
      commands.push(command);
    },
    terminate() {
      this.terminated += 1;
    },
    emit(event) {
      this.onmessage?.({ data: event });
    },
  };
  return { worker, commands };
}

const config = { seed: 1, instruments: 5, ratePerSecond: 100 };
const frame = (seq: number): WireFrame => [seq, 0, 0, 1, 0];

describe('createLiveSource', () => {
  it('starts the worker with its config on connect', () => {
    const { worker, commands } = fakeWorker();
    const source = createLiveSource({ config, tickMs: 25, createWorker: () => worker });
    source.connect();
    expect(commands).toEqual([{ type: 'start', config, tickMs: 25 }]);
  });

  it('delivers batches from the worker in order', async () => {
    const { worker } = fakeWorker();
    const source = createLiveSource({ config, createWorker: () => worker });
    const iterable = source.connect();
    worker.emit({ type: 'open' });
    worker.emit({ type: 'batch', frames: [frame(0), frame(1)] });
    worker.emit({ type: 'batch', frames: [frame(2)] });
    worker.emit({ type: 'closed', reason: 'stopped' });

    const batches: (readonly WireFrame[])[] = [];
    for await (const batch of iterable) batches.push(batch);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });

  it('completes when the worker reports closed', async () => {
    const { worker } = fakeWorker();
    const source = createLiveSource({ config, createWorker: () => worker });
    const iterator = source.connect()[Symbol.asyncIterator]();
    worker.emit({ type: 'closed', reason: 'fault' });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  it('close() terminates the worker and ends the iteration', async () => {
    const { worker } = fakeWorker();
    const source = createLiveSource({ config, createWorker: () => worker });
    const iterator = source.connect()[Symbol.asyncIterator]();
    const pending = iterator.next();
    source.close();
    expect(worker.terminated).toBe(1);
    expect(await pending).toEqual({ value: undefined, done: true });
    // Idempotent.
    source.close();
    expect(worker.terminated).toBe(1);
  });

  it('forwards rate changes and fault injection to the worker', () => {
    const { worker, commands } = fakeWorker();
    const source = createLiveSource({ config, createWorker: () => worker });
    source.connect();
    source.setRate(2_000);
    source.inject('stall');
    expect(commands.slice(1)).toEqual([
      { type: 'configure', ratePerSecond: 2_000 },
      { type: 'fault', fault: 'stall' },
    ]);
  });

  it('is single-use', () => {
    const { worker } = fakeWorker();
    const source = createLiveSource({ config, createWorker: () => worker });
    source.connect();
    expect(() => source.connect()).toThrow(/single-use/);
  });

  it('reports a worker error and closes', () => {
    const { worker } = fakeWorker();
    const onError = vi.fn();
    const source = createLiveSource({ config, createWorker: () => worker, onError });
    source.connect();
    const failure = new Error('worker crashed');
    worker.onerror?.(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(worker.terminated).toBe(1);
  });

  it('counts batches dropped while the consumer was not pulling', () => {
    const { worker } = fakeWorker();
    const source = createLiveSource({
      config,
      queueCapacity: 2,
      createWorker: () => worker,
    });
    source.connect();
    for (let i = 0; i < 5; i++) worker.emit({ type: 'batch', frames: [frame(i)] });
    expect(source.dropped).toBe(3);
  });
});
