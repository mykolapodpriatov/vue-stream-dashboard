import { CODE_BY_QUALITY, instrumentSpec, type WireFrame } from '@/domain/telemetry';
import { createPrng } from './prng';

export interface GeneratorConfig {
  /** Seed for every random decision the generator makes. Same seed, same stream. */
  readonly seed: number;
  /** Size of the fleet. Instrument ids are `0 … instruments - 1`. */
  readonly instruments: number;
  /** Aggregate event rate across the whole fleet. */
  readonly ratePerSecond: number;
  /**
   * Make the wire imperfect: occasional duplicate frames, out-of-order
   * delivery, `NaN` readings and quality codes nobody defined. Real feeds do
   * all of these, and a normalizer that has never seen them is untested.
   *
   * @defaultValue `false`
   */
  readonly dirtyWire?: boolean;
  /**
   * Epoch milliseconds of the first frame.
   *
   * @defaultValue `Date.now()` at creation
   */
  readonly startTs?: number;
}

export interface TelemetryGenerator {
  /**
   * Produce every frame due in the next `elapsedMs` of simulated time.
   * Fractional events carry over, so a slow tick does not lose rate.
   */
  advance(elapsedMs: number): WireFrame[];
  /** Change the aggregate rate without resetting instrument state. */
  setRate(ratePerSecond: number): void;
  /** The next sequence number to be issued. */
  readonly seq: number;
  /** Simulated clock, epoch milliseconds. */
  readonly ts: number;
}

/** Share of readings flagged `bad` and `suspect`, roughly what a real plant sees. */
const BAD_SHARE = 0.004;
const SUSPECT_SHARE = 0.03;

/** Dirty-wire fault rates, per frame. */
const DUPLICATE_SHARE = 0.002;
const REORDER_SHARE = 0.002;
const NAN_SHARE = 0.001;
const BAD_CODE_SHARE = 0.001;

/**
 * Deterministic event generator: each instrument is a bounded random walk
 * around a baseline chosen for its kind.
 *
 * Pure — no timers, no `Date.now()` after construction, no worker. It is driven
 * by `advance(elapsedMs)` so the same code produces a live stream inside a
 * worker and a fixture in a unit test, and the two agree to the frame.
 */
export function createTelemetryGenerator(config: GeneratorConfig): TelemetryGenerator {
  const { seed, instruments, dirtyWire = false } = config;
  if (!Number.isInteger(instruments) || instruments < 1) {
    throw new RangeError(`instruments must be a positive integer, got ${instruments}`);
  }
  let rate = config.ratePerSecond;
  const rng = createPrng(seed);

  const values = new Float64Array(instruments);
  for (let id = 0; id < instruments; id++) {
    const spec = instrumentSpec(id);
    values[id] = clamp(spec.baseline + rng.gaussian() * spec.spread, spec.min, spec.max);
  }

  let seq = 0;
  let clock = config.startTs ?? Date.now();
  let carry = 0;
  let previous: WireFrame | null = null;

  function reading(id: number, ts: number): WireFrame {
    const spec = instrumentSpec(id);
    const current = values[id] ?? spec.baseline;
    const value = clamp(current + rng.gaussian() * spec.step, spec.min, spec.max);
    values[id] = value;

    const roll = rng.next();
    const quality =
      roll < BAD_SHARE
        ? CODE_BY_QUALITY.bad
        : roll < BAD_SHARE + SUSPECT_SHARE
          ? CODE_BY_QUALITY.suspect
          : CODE_BY_QUALITY.good;

    const frame: WireFrame = [seq, ts, id, value, quality];
    seq += 1;
    return frame;
  }

  /** Corrupt a frame the way real transports do, at the configured rates. */
  function dirty(frame: WireFrame, out: WireFrame[]): void {
    const roll = rng.next();
    if (roll < DUPLICATE_SHARE && previous) {
      out.push(previous);
    } else if (roll < DUPLICATE_SHARE + REORDER_SHARE && previous) {
      // Swap with the previous frame: the consumer sees seq n+1 before n.
      out.pop();
      out.push(frame, previous);
      return;
    } else if (roll < DUPLICATE_SHARE + REORDER_SHARE + NAN_SHARE) {
      frame = [frame[0], frame[1], frame[2], Number.NaN, frame[4]];
    } else if (roll < DUPLICATE_SHARE + REORDER_SHARE + NAN_SHARE + BAD_CODE_SHARE) {
      frame = [frame[0], frame[1], frame[2], frame[3], 7];
    }
    out.push(frame);
  }

  function advance(elapsedMs: number): WireFrame[] {
    if (elapsedMs <= 0) return [];
    const due = (rate * elapsedMs) / 1000 + carry;
    const count = Math.floor(due);
    carry = due - count;

    const out: WireFrame[] = [];
    const start = clock;
    for (let i = 0; i < count; i++) {
      // Spread timestamps across the interval so a replay has gaps to pace on,
      // instead of every frame in a tick sharing one instant.
      const ts = Math.round(start + (elapsedMs * (i + 1)) / count);
      const frame = reading(rng.int(instruments), ts);
      if (dirtyWire) dirty(frame, out);
      else out.push(frame);
      previous = frame;
    }
    clock = start + elapsedMs;
    return out;
  }

  function setRate(ratePerSecond: number): void {
    rate = Math.max(0, ratePerSecond);
  }

  return {
    advance,
    setRate,
    get seq() {
      return seq;
    },
    get ts() {
      return clock;
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
