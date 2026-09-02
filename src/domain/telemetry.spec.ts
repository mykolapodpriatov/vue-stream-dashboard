import { describe, expect, it } from 'vitest';
import {
  CODE_BY_QUALITY,
  describeInstrument,
  INSTRUMENT_SPECS,
  instrumentSpec,
  QUALITY_BY_CODE,
} from './telemetry';

describe('telemetry domain', () => {
  it('maps quality codes both ways', () => {
    for (const [index, quality] of QUALITY_BY_CODE.entries()) {
      expect(CODE_BY_QUALITY[quality]).toBe(index);
    }
  });

  it('derives a stable, zero-padded name from the id', () => {
    expect(describeInstrument(7).name).toBe('FLW-00007');
    expect(describeInstrument(7)).toEqual(describeInstrument(7));
  });

  it('cycles instrument kinds across the fleet', () => {
    const kinds = new Set(
      Array.from(
        { length: INSTRUMENT_SPECS.length * 3 },
        (_, id) => instrumentSpec(id).kind,
      ),
    );
    expect(kinds.size).toBe(INSTRUMENT_SPECS.length);
  });

  it('keeps every spec internally consistent', () => {
    for (const spec of INSTRUMENT_SPECS) {
      expect(spec.min).toBeLessThan(spec.baseline);
      expect(spec.baseline).toBeLessThan(spec.max);
      expect(spec.step).toBeLessThan(spec.spread);
    }
  });
});
