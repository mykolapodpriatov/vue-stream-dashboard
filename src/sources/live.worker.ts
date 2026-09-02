import {
  createLiveWorkerController,
  type WorkerCommand,
  type WorkerEvent,
} from './liveWorkerCore';

/**
 * The worker entry point: five lines of wiring around
 * {@link createLiveWorkerController}, which holds every line worth testing.
 *
 * `self` is typed structurally instead of via `lib: ["webworker"]`, because
 * that lib and the DOM lib declare overlapping globals and cannot share a
 * TypeScript program — and this file is the only one that runs off the main
 * thread.
 */
interface WorkerScope {
  postMessage(message: WorkerEvent): void;
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const controller = createLiveWorkerController(scope);

scope.onmessage = (event) => {
  controller.handle(event.data);
};
