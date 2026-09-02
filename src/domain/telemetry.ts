/**
 * The domain: a fleet of instruments — sensors — each reporting readings a few
 * times a second. Individually that is nothing; across ten thousand of them it
 * is tens of thousands of events per second, which is the load this dashboard
 * exists to absorb.
 *
 * The domain is synthetic on purpose. The interesting problems here are all in
 * how the data reaches the DOM, and a domain nobody has to learn keeps the
 * attention there.
 */

/**
 * A frame as it arrives off the wire: `[seq, ts, instrumentId, value, quality]`.
 *
 * A positional tuple rather than an object, for the same reason real
 * high-frequency feeds use one — at ten thousand frames a second, the property
 * names are most of the bytes. It is also deliberately not trusted: a frame
 * from a file, a worker or a socket is validated by the normalizer before it
 * becomes a {@link TelemetryEvent}.
 */
export type WireFrame = readonly [
  seq: number,
  ts: number,
  instrumentId: number,
  value: number,
  quality: number,
];

/**
 * How much to believe a reading. The vocabulary is borrowed from industrial
 * telemetry, where every value carries one of these: a `suspect` reading is
 * shown but flagged, a `bad` one is shown as absent.
 */
export type Quality = 'good' | 'suspect' | 'bad';

/** Wire code → quality. Any other code is a malformed frame. */
export const QUALITY_BY_CODE: readonly Quality[] = ['good', 'suspect', 'bad'];

export const CODE_BY_QUALITY: Readonly<Record<Quality, number>> = {
  good: 0,
  suspect: 1,
  bad: 2,
};

/** A validated, typed reading — the only shape the pipeline works with. */
export interface TelemetryEvent {
  /** Monotonic per source. Used to drop duplicates and detect gaps. */
  readonly seq: number;
  /** Source timestamp, epoch milliseconds. */
  readonly ts: number;
  readonly instrumentId: number;
  readonly value: number;
  readonly quality: Quality;
}

export type InstrumentKind =
  'temperature' | 'pressure' | 'flow' | 'vibration' | 'humidity';

export interface InstrumentSpec {
  readonly kind: InstrumentKind;
  readonly prefix: string;
  readonly unit: string;
  /** Where a healthy instrument sits, and how far from it they typically spread. */
  readonly baseline: number;
  readonly spread: number;
  /** Size of one random-walk step, so the trace looks like a reading and not noise. */
  readonly step: number;
  readonly min: number;
  readonly max: number;
  /** Decimal places worth showing. */
  readonly precision: number;
}

export const INSTRUMENT_SPECS: readonly [InstrumentSpec, ...InstrumentSpec[]] = [
  {
    kind: 'temperature',
    prefix: 'TMP',
    unit: '°C',
    baseline: 62,
    spread: 8,
    step: 0.15,
    min: -20,
    max: 140,
    precision: 1,
  },
  {
    kind: 'pressure',
    prefix: 'PRS',
    unit: 'kPa',
    baseline: 410,
    spread: 40,
    step: 1.2,
    min: 0,
    max: 900,
    precision: 0,
  },
  {
    kind: 'flow',
    prefix: 'FLW',
    unit: 'L/min',
    baseline: 24,
    spread: 6,
    step: 0.3,
    min: 0,
    max: 80,
    precision: 1,
  },
  {
    kind: 'vibration',
    prefix: 'VIB',
    unit: 'mm/s',
    baseline: 2.4,
    spread: 0.8,
    step: 0.05,
    min: 0,
    max: 20,
    precision: 2,
  },
  {
    kind: 'humidity',
    prefix: 'HUM',
    unit: '%',
    baseline: 48,
    spread: 10,
    step: 0.2,
    min: 0,
    max: 100,
    precision: 0,
  },
];

export interface InstrumentInfo {
  readonly id: number;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly unit: string;
  readonly precision: number;
}

/**
 * Everything static about an instrument is derived from its id, so nothing
 * has to be stored, fetched or kept in sync — and a recording is complete
 * with frames alone.
 */
export function instrumentSpec(id: number): InstrumentSpec {
  // A non-negative integer id always lands on a spec; the fallback exists only
  // to make the return type honest under `noUncheckedIndexedAccess`.
  return INSTRUMENT_SPECS[Math.abs(id) % INSTRUMENT_SPECS.length] ?? INSTRUMENT_SPECS[0];
}

export function describeInstrument(id: number): InstrumentInfo {
  const spec = instrumentSpec(id);
  return {
    id,
    name: `${spec.prefix}-${String(id).padStart(5, '0')}`,
    kind: spec.kind,
    unit: spec.unit,
    precision: spec.precision,
  };
}
