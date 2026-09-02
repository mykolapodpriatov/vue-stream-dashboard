/**
 * The one interface every event source implements.
 *
 * Two sources exist — a Web Worker generating events live, and a recording
 * being replayed — and the dashboard must not be able to tell them apart. That
 * single constraint is what makes bug reports reproducible (record it, attach
 * the file), makes end-to-end tests deterministic (replay a fixture instead of
 * hoping the generator behaves), and makes the demo work offline.
 *
 * Why an `AsyncIterable`, and not a callback: **pull** semantics. A consumer
 * that is not ready does not call `next()`, and the source waits. That is what
 * makes the `step` replay mode — one batch per click — fall out of the
 * interface for free, rather than being a special case bolted onto a push API.
 * Cancellation is also already defined: `break` out of the loop, and the
 * iterator's `return()` runs the cleanup.
 *
 * Why batches, not single events: at ten thousand events a second, a promise
 * per event is the wrong shape. A source delivers what arrived since the last
 * pull, and the consumer decides how to spread it over frames.
 *
 * Not named `EventSource`, because the DOM already has one of those, and a
 * type that shadows a global is a bug that only appears in the file that
 * forgot the import.
 */
export interface StreamSource<T> {
  /**
   * Open the source and iterate its batches until it is closed or exhausted.
   * A source is single-use: connecting twice is an error, not a reconnect.
   */
  connect(): AsyncIterable<readonly T[]>;
  /** Stop producing. The iterable completes. Safe to call more than once. */
  close(): void;
}
