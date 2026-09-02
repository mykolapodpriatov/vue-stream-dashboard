import { QUALITY_BY_CODE, type TelemetryEvent } from '@/domain/telemetry';

/**
 * Why each frame was rejected, and how many were let through. Counted rather
 * than logged: at ten thousand frames a second a console line per bad frame is
 * a denial-of-service against the developer.
 */
export interface NormalizerStats {
  accepted: number;
  /** Wrong shape, non-finite number, unknown quality code. */
  malformed: number;
  /** A sequence number already accepted within the window. */
  duplicate: number;
  /** Older than the window can vouch for — dropped rather than risk a duplicate. */
  stale: number;
  /** Accepted, but arrived after a higher sequence number had. */
  reordered: number;
  /** Frames that never arrived, by sequence number. Filled in if they turn up late. */
  gaps: number;
}

export interface NormalizerOptions {
  /**
   * How many recent sequence numbers to remember for duplicate detection.
   *
   * @defaultValue `4096`
   */
  window?: number;
}

export interface Normalizer {
  /** Validate one wire frame. `null` means rejected; the stats say why. */
  normalize(frame: unknown): TelemetryEvent | null;
  readonly stats: Readonly<NormalizerStats>;
  /**
   * Forget the sequence history but keep the counters. For a new source:
   * its numbering starts over, the session's tallies do not.
   */
  forgetSequence(): void;
  /** Forget everything — history and counters. */
  reset(): void;
}

function emptyStats(): NormalizerStats {
  return { accepted: 0, malformed: 0, duplicate: 0, stale: 0, reordered: 0, gaps: 0 };
}

/**
 * The trust boundary. Everything upstream of this is `unknown`; everything
 * downstream is a {@link TelemetryEvent} and can be used without checking.
 *
 * Duplicate detection uses a ring indexed by `seq % window`: each slot holds
 * the last sequence number that landed there, so a lookup is one array read
 * with no allocation and no eviction pass. The cost is that a frame older than
 * the window cannot be vouched for — it is dropped as `stale`, on the grounds
 * that a reading that late is not a reading anyone is waiting for.
 */
export function createNormalizer(options: NormalizerOptions = {}): Normalizer {
  const { window = 4096 } = options;
  const seen = new Float64Array(window).fill(-1);
  let highest = -1;
  const stats = emptyStats();

  function normalize(frame: unknown): TelemetryEvent | null {
    if (!Array.isArray(frame) || frame.length !== 5) {
      stats.malformed += 1;
      return null;
    }
    const [seq, ts, instrumentId, value, code] = frame as unknown[];
    if (
      !Number.isInteger(seq) ||
      (seq as number) < 0 ||
      !Number.isFinite(ts) ||
      !Number.isInteger(instrumentId) ||
      (instrumentId as number) < 0 ||
      !Number.isFinite(value) ||
      !Number.isInteger(code)
    ) {
      stats.malformed += 1;
      return null;
    }
    const quality = QUALITY_BY_CODE[code as number];
    if (quality === undefined) {
      stats.malformed += 1;
      return null;
    }

    const sequence = seq as number;
    if (sequence > highest) {
      if (highest >= 0 && sequence > highest + 1) stats.gaps += sequence - highest - 1;
      highest = sequence;
    } else if (sequence <= highest - window) {
      stats.stale += 1;
      return null;
    } else if (seen[sequence % window] === sequence) {
      stats.duplicate += 1;
      return null;
    } else {
      // Late but new: it fills a gap we counted earlier.
      stats.reordered += 1;
      if (stats.gaps > 0) stats.gaps -= 1;
    }
    seen[sequence % window] = sequence;
    stats.accepted += 1;

    return {
      seq: sequence,
      ts: ts as number,
      instrumentId: instrumentId as number,
      value: value as number,
      quality,
    };
  }

  function forgetSequence(): void {
    seen.fill(-1);
    highest = -1;
  }

  function reset(): void {
    forgetSequence();
    Object.assign(stats, emptyStats());
  }

  return { normalize, stats, forgetSequence, reset };
}
