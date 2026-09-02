import {
  describeInstrument,
  type InstrumentInfo,
  type Quality,
  type TelemetryEvent,
} from '@/domain/telemetry';

/**
 * One instrument's current state. A plain, mutable object — **not** reactive,
 * and never wrapped in `reactive()` or `ref()`.
 *
 * `updates === 0` means no reading has arrived yet; `value` is `NaN` until
 * then, so nothing can accidentally render a zero as a measurement.
 */
export interface InstrumentRow extends InstrumentInfo {
  value: number;
  /** The reading before this one, for showing direction of change. */
  previous: number;
  ts: number;
  quality: Quality;
  updates: number;
}

/**
 * What the UI renders from. Published once per frame through a `shallowRef`.
 *
 * `rows` is the **same array** on every snapshot, and its row objects are the
 * same objects, mutated in place between commits. A snapshot is a version
 * marker, not a copy: copying ten thousand rows sixty times a second would
 * spend the frame budget on garbage in order to guarantee an immutability
 * nothing needs. Components read rows only during render, render runs only on
 * commit, and a commit happens only after the whole batch has been applied —
 * so no render ever observes a half-applied frame.
 */
export interface Snapshot {
  /** Commit number. Strictly increasing; equal snapshots have equal frames. */
  readonly frame: number;
  /** Frame timestamp from the scheduler. */
  readonly at: number;
  readonly rows: readonly InstrumentRow[];
  /** Ids whose row changed in this commit, each once. */
  readonly updated: readonly number[];
  /** Highest sequence number applied so far, or -1. */
  readonly seq: number;
}

export interface TelemetryState {
  readonly rows: readonly InstrumentRow[];
  /** Mutate rows from a batch. Returns how many events addressed an unknown id. */
  apply(events: readonly TelemetryEvent[]): number;
  /** Publish the current state and clear the updated set. */
  snapshot(frame: number, at: number): Snapshot;
  /** Replace the fleet, discarding every reading. */
  resize(instruments: number): void;
}

function emptyRow(id: number): InstrumentRow {
  return {
    ...describeInstrument(id),
    value: Number.NaN,
    previous: Number.NaN,
    ts: 0,
    quality: 'good',
    updates: 0,
  };
}

export function createTelemetryState(instruments: number): TelemetryState {
  let rows: InstrumentRow[] = [];
  /** Which rows changed since the last snapshot — a bitmap plus an id list, so
   *  marking is O(1) and the list has no duplicates. */
  let dirty = new Uint8Array(0);
  let updated: number[] = [];
  let seq = -1;

  function resize(count: number): void {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`instruments must be a positive integer, got ${count}`);
    }
    rows = Array.from({ length: count }, (_, id) => emptyRow(id));
    dirty = new Uint8Array(count);
    updated = [];
    seq = -1;
  }

  function apply(events: readonly TelemetryEvent[]): number {
    let unknown = 0;
    for (const event of events) {
      const row = rows[event.instrumentId];
      if (!row) {
        unknown += 1;
        continue;
      }
      row.previous = row.value;
      row.value = event.value;
      row.ts = event.ts;
      row.quality = event.quality;
      row.updates += 1;
      if (event.seq > seq) seq = event.seq;
      if (dirty[event.instrumentId] === 0) {
        dirty[event.instrumentId] = 1;
        updated.push(event.instrumentId);
      }
    }
    return unknown;
  }

  function snapshot(frame: number, at: number): Snapshot {
    const changed = updated;
    for (const id of changed) dirty[id] = 0;
    updated = [];
    return { frame, at, rows, updated: changed, seq };
  }

  resize(instruments);

  return {
    get rows() {
      return rows;
    },
    apply,
    snapshot,
    resize,
  };
}
