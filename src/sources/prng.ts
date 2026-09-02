/**
 * A seeded pseudo-random number generator.
 *
 * `Math.random()` cannot be seeded, and a generator that cannot be seeded
 * cannot be replayed: the same configuration produces a different stream every
 * run, so a bug seen once is a bug seen once. Everything random in the live
 * source goes through this instead, and a seed is enough to reproduce an
 * entire session.
 *
 * mulberry32 — 32-bit state, one multiply and a few shifts per number. Not
 * cryptographic, and not trying to be; it is uniform enough for a sensor
 * simulation and fast enough to call ten thousand times a second.
 */
export interface Prng {
  /** Uniform in `[0, 1)`. */
  next(): number;
  /** Uniform integer in `[0, maxExclusive)`. */
  int(maxExclusive: number): number;
  /** Standard normal — mean 0, deviation 1. */
  gaussian(): number;
}

export function createPrng(seed: number): Prng {
  // Seeds are user-supplied and may be floats or negative; fold them into a
  // 32-bit unsigned state deterministically.
  let state = Math.floor(seed) >>> 0 || 0x9e3779b9;
  let spare: number | null = null;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive);
  }

  /** Marsaglia polar method; produces two normals per pass, so cache the second. */
  function gaussian(): number {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * factor;
    return u * factor;
  }

  return { next, int, gaussian };
}
