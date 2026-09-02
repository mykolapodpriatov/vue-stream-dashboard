import type { WireFrame } from '@/domain/telemetry';
import type { GeneratorConfig } from './generator';
import type { Fault, WorkerCommand, WorkerEvent } from './liveWorkerCore';
import { createPushQueue } from './pushQueue';
import type { StreamSource } from './StreamSource';

/** The subset of `Worker` the source relies on, so a test can supply a fake. */
export interface WorkerLike {
  postMessage(message: WorkerCommand): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerEvent }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface LiveSourceOptions {
  readonly config: GeneratorConfig;
  /**
   * How often the worker flushes a batch. 20ms is a little under a frame: the
   * consumer sees at most one or two batches per paint and never starves.
   *
   * @defaultValue `20`
   */
  readonly tickMs?: number;
  /**
   * Batches held for a consumer that is not pulling. See `createPushQueue` for
   * why the oldest are dropped past this point.
   *
   * @defaultValue `64`
   */
  readonly queueCapacity?: number;
  /**
   * Construct the worker. Injectable so tests can run without one, and so the
   * bundler-specific `new Worker(new URL(...))` incantation lives in one place.
   */
  readonly createWorker?: () => WorkerLike;
  /** Notified of worker errors. The iteration ends either way. */
  readonly onError?: (error: unknown) => void;
}

export interface LiveSource extends StreamSource<WireFrame> {
  /** Change the aggregate event rate without restarting the fleet. */
  setRate(ratePerSecond: number): void;
  /** Inject a transport fault. See {@link Fault}. */
  inject(fault: Fault): void;
  /** Batches discarded because the consumer fell behind. */
  readonly dropped: number;
}

function createModuleWorker(): WorkerLike {
  return new Worker(new URL('./live.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

/**
 * A live event source backed by a Web Worker.
 *
 * Generating tens of thousands of events a second is real CPU work, and doing
 * it on the main thread would mean the dashboard competing with its own data
 * for frame time. Worse, it would blur the measurement: a slow frame could be
 * the renderer or the generator, and there would be no way to tell.
 */
export function createLiveSource(options: LiveSourceOptions): LiveSource {
  const {
    config,
    tickMs = 20,
    queueCapacity = 64,
    createWorker = createModuleWorker,
    onError,
  } = options;

  let worker: WorkerLike | null = null;
  let connected = false;
  const queue = createPushQueue<readonly WireFrame[]>({ capacity: queueCapacity });

  function connect(): AsyncIterable<readonly WireFrame[]> {
    if (connected) throw new Error('LiveSource is single-use: already connected');
    connected = true;

    const instance = createWorker();
    worker = instance;
    instance.onmessage = ({ data }) => {
      if (data.type === 'batch') queue.push(data.frames);
      else if (data.type === 'closed') queue.end();
    };
    instance.onerror = (error) => {
      onError?.(error);
      close();
    };
    instance.postMessage({ type: 'start', config, tickMs });
    return queue;
  }

  function close(): void {
    const instance = worker;
    worker = null;
    if (instance) {
      instance.onmessage = null;
      instance.onerror = null;
      instance.terminate();
    }
    queue.end();
  }

  function setRate(ratePerSecond: number): void {
    worker?.postMessage({ type: 'configure', ratePerSecond });
  }

  function inject(fault: Fault): void {
    worker?.postMessage({ type: 'fault', fault });
  }

  return {
    connect,
    close,
    setRate,
    inject,
    get dropped() {
      return queue.dropped;
    },
  };
}
