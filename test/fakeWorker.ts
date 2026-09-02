import type { WireFrame } from '@/domain/telemetry';
import type { WorkerLike } from '@/sources/LiveSource';
import type { WorkerCommand, WorkerEvent } from '@/sources/liveWorkerCore';

/**
 * A worker the test plays the part of. It answers the protocol the way the
 * real controller does — `open` on start, `closed` on stop or drop — and lets
 * the test push batches by hand.
 */
export interface FakeWorker extends WorkerLike {
  readonly commands: WorkerCommand[];
  readonly terminated: number;
  emit(event: WorkerEvent): void;
  emitBatch(frames: WireFrame[]): void;
}

export function createFakeWorker(): FakeWorker {
  const commands: WorkerCommand[] = [];
  let terminated = 0;
  const worker: FakeWorker = {
    commands,
    get terminated() {
      return terminated;
    },
    onmessage: null,
    onerror: null,
    postMessage(command) {
      commands.push(command);
      if (command.type === 'start') worker.emit({ type: 'open' });
      if (command.type === 'stop') worker.emit({ type: 'closed', reason: 'stopped' });
      if (command.type === 'fault' && command.fault === 'drop') {
        worker.emit({ type: 'closed', reason: 'fault' });
      }
    },
    terminate() {
      terminated += 1;
    },
    emit(event) {
      worker.onmessage?.({ data: event });
    },
    emitBatch(frames) {
      worker.emit({ type: 'batch', frames });
    },
  };
  return worker;
}

export const frame = (seq: number, id: number, value: number, quality = 0): WireFrame => [
  seq,
  1_700_000_000_000 + seq,
  id,
  value,
  quality,
];
