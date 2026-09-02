/**
 * A fixed-capacity FIFO that overwrites its oldest entry when full.
 *
 * This is the shock absorber between "events arrive whenever they arrive" and
 * "the DOM updates once per frame". Between two frames it fills; on the frame
 * it drains. If a frame is late — the tab was hidden, the main thread was
 * busy — it keeps the most recent `capacity` items and counts what it lost,
 * because for a live view the newest data is the data worth keeping.
 *
 * `drain` hands items over in arrival order and leaves the buffer empty. There
 * is deliberately no `shift()`: consuming one at a time is the access pattern
 * this buffer exists to prevent.
 */
export interface RingBuffer<T> {
  push(item: T): void;
  /** Append every buffered item to `into`, oldest first, and empty the buffer. */
  drain(into: T[]): number;
  clear(): void;
  readonly size: number;
  readonly capacity: number;
  /** Items overwritten before they could be drained. */
  readonly dropped: number;
}

export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  const slots = new Array<T | undefined>(capacity);
  let head = 0;
  let size = 0;
  let dropped = 0;

  function push(item: T): void {
    if (size === capacity) {
      slots[head] = item;
      head = (head + 1) % capacity;
      dropped += 1;
      return;
    }
    slots[(head + size) % capacity] = item;
    size += 1;
  }

  function drain(into: T[]): number {
    const count = size;
    for (let i = 0; i < count; i++) {
      const index = (head + i) % capacity;
      into.push(slots[index] as T);
      // Release the reference; a ring that holds drained items pins garbage.
      slots[index] = undefined;
    }
    head = 0;
    size = 0;
    return count;
  }

  function clear(): void {
    slots.fill(undefined);
    head = 0;
    size = 0;
  }

  return {
    push,
    drain,
    clear,
    get size() {
      return size;
    },
    get capacity() {
      return capacity;
    },
    get dropped() {
      return dropped;
    },
  };
}
