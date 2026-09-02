/**
 * Adapts a push producer — `worker.onmessage`, `socket.onmessage` — to the pull
 * shape of {@link StreamSource}.
 *
 * The queue is bounded. A producer that outruns its consumer does not grow the
 * heap until the tab dies; it drops the **oldest** items and counts them. For a
 * live feed the newest data is the valuable data, and a consumer that fell
 * behind wants to catch up to now, not replay a backlog it has already missed
 * the moment for. The count is exposed so the UI can say so instead of
 * silently showing a gap.
 */
export interface PushQueue<T> extends AsyncIterable<T> {
  push(item: T): void;
  /** Complete the iteration once the buffered items are drained. */
  end(): void;
  readonly size: number;
  /** Items discarded because the consumer was behind by more than `capacity`. */
  readonly dropped: number;
  readonly ended: boolean;
}

export interface PushQueueOptions {
  /**
   * Maximum buffered items before the oldest is discarded.
   *
   * @defaultValue `256`
   */
  capacity?: number;
}

export function createPushQueue<T>(options: PushQueueOptions = {}): PushQueue<T> {
  const { capacity = 256 } = options;
  const items: T[] = [];
  let dropped = 0;
  let ended = false;
  /** Set while a consumer is awaiting an empty queue. */
  let waiting: ((result: IteratorResult<T>) => void) | null = null;

  function settle(result: IteratorResult<T>): void {
    const resolve = waiting;
    waiting = null;
    resolve?.(result);
  }

  function push(item: T): void {
    if (ended) return;
    if (waiting) {
      // Hand it straight over — going through the array would be a needless
      // allocation on the hot path.
      settle({ value: item, done: false });
      return;
    }
    if (items.length >= capacity) {
      items.shift();
      dropped += 1;
    }
    items.push(item);
  }

  function end(): void {
    if (ended) return;
    ended = true;
    if (items.length === 0) settle({ value: undefined, done: true });
  }

  function next(): Promise<IteratorResult<T>> {
    if (items.length > 0) {
      return Promise.resolve({ value: items.shift() as T, done: false });
    }
    if (ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      waiting = resolve;
    });
  }

  function finish(): Promise<IteratorResult<T>> {
    // The consumer broke out of its loop. Whatever is buffered is now
    // unwanted, so drop it rather than let `end()` wait on a drain that
    // will never happen.
    ended = true;
    items.length = 0;
    settle({ value: undefined, done: true });
    return Promise.resolve({ value: undefined, done: true });
  }

  return {
    push,
    end,
    get size() {
      return items.length;
    },
    get dropped() {
      return dropped;
    },
    get ended() {
      return ended;
    },
    [Symbol.asyncIterator]() {
      return { next, return: finish };
    },
  };
}
