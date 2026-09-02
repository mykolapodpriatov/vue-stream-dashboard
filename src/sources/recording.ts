import type { WireFrame } from '@/domain/telemetry';
import { createTelemetryGenerator, type GeneratorConfig } from './generator';

/**
 * A recording: the frames of a session plus enough metadata to make sense of
 * them. It is the unit of reproducibility — attach one to a bug report and the
 * dashboard can be put into the exact state that produced it.
 */
export interface Recording {
  readonly version: 1;
  readonly meta: RecordingMeta;
  readonly frames: readonly WireFrame[];
}

export interface RecordingMeta {
  readonly instruments: number;
  /** Present when the recording came from the generator, so it can be regenerated. */
  readonly seed?: number;
  readonly ratePerSecond?: number;
  /** ISO 8601, when the recording was made. */
  readonly recordedAt?: string;
}

export interface SyntheticRecordingOptions extends GeneratorConfig {
  readonly durationMs: number;
  /**
   * Simulated interval between generator ticks.
   *
   * @defaultValue `20`
   */
  readonly tickMs?: number;
}

/**
 * Generate a recording without recording anything.
 *
 * The generator is deterministic, so a seed and a duration describe a
 * recording completely — there is no need to check a megabyte of JSON into
 * the repository for the end-to-end tests to have a fixture. The same call
 * with the same arguments yields the same frames on every machine.
 */
export function createSyntheticRecording(options: SyntheticRecordingOptions): Recording {
  const { durationMs, tickMs = 20, ...config } = options;
  const generator = createTelemetryGenerator(config);
  const frames: WireFrame[] = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += tickMs) {
    frames.push(...generator.advance(Math.min(tickMs, durationMs - elapsed)));
  }
  return {
    version: 1,
    meta: {
      instruments: config.instruments,
      seed: config.seed,
      ratePerSecond: config.ratePerSecond,
    },
    frames,
  };
}

export function serializeRecording(recording: Recording): string {
  return JSON.stringify(recording);
}

/**
 * Validate an untrusted value into a {@link Recording}.
 *
 * Throws `SyntaxError` — the same class `JSON.parse` throws — because the
 * meaning is the same: the input is not in the shape it claims. Callers that
 * classify failures can treat both identically, and neither is worth retrying.
 */
export function parseRecording(input: unknown): Recording {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!isRecord(raw)) throw new SyntaxError('Recording must be an object');
  if (raw.version !== 1) throw new SyntaxError('Unsupported recording version');

  const meta = raw.meta;
  if (!isRecord(meta)) throw new SyntaxError('Recording is missing meta');
  const instruments = meta.instruments;
  if (!Number.isInteger(instruments) || (instruments as number) < 1) {
    throw new SyntaxError('meta.instruments must be a positive integer');
  }

  const frames = raw.frames;
  if (!Array.isArray(frames)) throw new SyntaxError('Recording is missing frames');
  for (let i = 0; i < frames.length; i++) {
    if (!isWireFrame(frames[i])) throw new SyntaxError(`Frame ${i} is malformed`);
  }

  const result: RecordingMeta = { instruments: instruments as number };
  const seed = meta.seed;
  const rate = meta.ratePerSecond;
  const recordedAt = meta.recordedAt;
  return {
    version: 1,
    meta: {
      ...result,
      ...(typeof seed === 'number' ? { seed } : {}),
      ...(typeof rate === 'number' ? { ratePerSecond: rate } : {}),
      ...(typeof recordedAt === 'string' ? { recordedAt } : {}),
    },
    frames: frames as WireFrame[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shape check only: five numbers. Whether the numbers make sense — a finite
 * value, a known quality code, a sequence that goes forwards — is the
 * normalizer's job, and a recording of a dirty wire should faithfully contain
 * the dirt.
 */
function isWireFrame(value: unknown): value is WireFrame {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((field: unknown) => typeof field === 'number')
  );
}
