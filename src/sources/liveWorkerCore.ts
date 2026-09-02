import type { WireFrame } from '@/domain/telemetry';
import {
  createTelemetryGenerator,
  type GeneratorConfig,
  type TelemetryGenerator,
} from './generator';

/**
 * The protocol between the main thread and the live worker.
 *
 * It is shaped like a socket on purpose — `open`, messages, `closed` — so the
 * same worker can later sit behind a transport abstraction that expects a
 * socket, and so the faults it can inject are the faults a socket has.
 */
export type WorkerCommand =
  | { readonly type: 'start'; readonly config: GeneratorConfig; readonly tickMs: number }
  | { readonly type: 'stop' }
  | { readonly type: 'configure'; readonly ratePerSecond: number }
  | { readonly type: 'fault'; readonly fault: Fault };

/**
 * Injectable failures, for demonstrating what the consumer does about them.
 *
 * - `stall` — the worker stays "connected" and stops sending. The zombie
 *   connection: nothing errors, the data just stops being new.
 * - `drop` — the worker closes. The honest failure, which is the easy one.
 */
export type Fault = 'none' | 'stall' | 'drop';

export type WorkerEvent =
  | { readonly type: 'open' }
  | { readonly type: 'batch'; readonly frames: WireFrame[] }
  | { readonly type: 'closed'; readonly reason: 'stopped' | 'fault' };

export interface WorkerPort {
  postMessage(message: WorkerEvent): void;
}

/** The timer surface the controller uses, so a test can drive it by hand. */
export interface WorkerTimers {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  now(): number;
}

const realTimers: WorkerTimers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (id) => {
    clearInterval(id);
  },
  now: () => performance.now(),
};

export interface LiveWorkerController {
  handle(command: WorkerCommand): void;
  /** Stop everything without announcing it. For tests and worker teardown. */
  dispose(): void;
}

/**
 * Everything the worker does, minus the `self.onmessage` wiring.
 *
 * Split out so it can be unit-tested in Node with fake timers. A `Worker` is
 * not constructible in a test environment, and the logic worth testing —
 * cadence, rate changes, fault behaviour — has nothing to do with the thread
 * it runs on.
 */
export function createLiveWorkerController(
  port: WorkerPort,
  timers: WorkerTimers = realTimers,
): LiveWorkerController {
  let generator: TelemetryGenerator | null = null;
  let timer: number | null = null;
  let last = 0;
  let fault: Fault = 'none';

  function stopTimer(): void {
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
  }

  function tick(): void {
    if (!generator) return;
    const now = timers.now();
    const elapsed = now - last;
    last = now;
    const frames = generator.advance(elapsed);
    // A stalled worker keeps generating so its clock and sequence stay
    // coherent, and simply never posts. That is exactly what a peer that
    // vanished without a close frame looks like from the other side.
    if (fault === 'stall') return;
    if (frames.length > 0) port.postMessage({ type: 'batch', frames });
  }

  function start(config: GeneratorConfig, tickMs: number): void {
    stopTimer();
    generator = createTelemetryGenerator(config);
    fault = 'none';
    last = timers.now();
    port.postMessage({ type: 'open' });
    timer = timers.setInterval(tick, tickMs);
  }

  function stop(reason: 'stopped' | 'fault'): void {
    if (!generator) return;
    stopTimer();
    generator = null;
    port.postMessage({ type: 'closed', reason });
  }

  function handle(command: WorkerCommand): void {
    switch (command.type) {
      case 'start':
        start(command.config, command.tickMs);
        return;
      case 'stop':
        stop('stopped');
        return;
      case 'configure':
        generator?.setRate(command.ratePerSecond);
        return;
      case 'fault':
        fault = command.fault;
        if (fault === 'drop') stop('fault');
        return;
    }
  }

  function dispose(): void {
    stopTimer();
    generator = null;
  }

  return { handle, dispose };
}
