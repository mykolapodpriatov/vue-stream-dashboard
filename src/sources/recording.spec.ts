import { describe, expect, it } from 'vitest';
import {
  createSyntheticRecording,
  parseRecording,
  serializeRecording,
} from './recording';

describe('createSyntheticRecording', () => {
  it('is reproducible from its parameters alone', () => {
    const options = {
      seed: 9,
      instruments: 50,
      ratePerSecond: 500,
      durationMs: 400,
      startTs: 0,
    };
    const a = createSyntheticRecording(options);
    const b = createSyntheticRecording(options);
    expect(a).toEqual(b);
    expect(a.frames.length).toBe(200);
    expect(a.meta).toEqual({ instruments: 50, seed: 9, ratePerSecond: 500 });
  });

  it('covers exactly the requested duration, including a partial last tick', () => {
    const recording = createSyntheticRecording({
      seed: 1,
      instruments: 10,
      ratePerSecond: 1_000,
      durationMs: 50,
      tickMs: 20,
      startTs: 1_000,
    });
    expect(recording.frames.length).toBe(50);
    expect(recording.frames.at(-1)![1]).toBe(1_050);
  });
});

describe('parseRecording', () => {
  const valid = createSyntheticRecording({
    seed: 3,
    instruments: 4,
    ratePerSecond: 100,
    durationMs: 100,
  });

  it('round-trips through JSON', () => {
    expect(parseRecording(serializeRecording(valid))).toEqual(valid);
  });

  it('accepts an already-parsed object', () => {
    expect(parseRecording(JSON.parse(serializeRecording(valid)))).toEqual(valid);
  });

  it('keeps optional metadata only when present and well-typed', () => {
    const parsed = parseRecording({
      version: 1,
      meta: { instruments: 2, seed: 'nope', recordedAt: '2026-09-02T00:00:00Z' },
      frames: [],
    });
    expect(parsed.meta).toEqual({ instruments: 2, recordedAt: '2026-09-02T00:00:00Z' });
  });

  it.each([
    ['not an object', 'null', /object/],
    ['an array', '[]', /object/],
    ['a wrong version', '{"version":2,"meta":{"instruments":1},"frames":[]}', /version/],
    ['missing meta', '{"version":1,"frames":[]}', /meta/],
    ['a zero fleet', '{"version":1,"meta":{"instruments":0},"frames":[]}', /instruments/],
    ['missing frames', '{"version":1,"meta":{"instruments":1}}', /frames/],
    [
      'a short frame',
      '{"version":1,"meta":{"instruments":1},"frames":[[1,2,3]]}',
      /Frame 0/,
    ],
    [
      'a non-numeric field',
      '{"version":1,"meta":{"instruments":1},"frames":[[0,1,0,1,0],[1,"x",0,1,0]]}',
      /Frame 1/,
    ],
  ])('rejects %s', (_label, json, message) => {
    expect(() => parseRecording(json)).toThrow(SyntaxError);
    expect(() => parseRecording(json)).toThrow(message);
  });

  it('propagates JSON syntax errors as-is', () => {
    expect(() => parseRecording('{not json')).toThrow(SyntaxError);
  });
});
