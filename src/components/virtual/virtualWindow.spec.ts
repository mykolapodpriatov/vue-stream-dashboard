import { describe, expect, it } from 'vitest';
import { computeWindow, scrollTopFor } from './virtualWindow';

describe('computeWindow', () => {
  // 10 000 rows of 32px in a 600px viewport, 4 rows of overscan.
  const win = (scrollTop: number, count = 10_000) =>
    computeWindow(count, 32, 600, scrollTop, 4);

  it('renders the visible rows plus overscan, and nothing else', () => {
    const w = win(0);
    // 600 / 32 = 18.75 → rows 0..18 visible (19), plus 4 overscan below.
    expect(w).toEqual({ start: 0, end: 23, offsetTop: 0, totalHeight: 320_000 });
  });

  it('keeps the DOM small regardless of the dataset', () => {
    for (const scrollTop of [0, 1_000, 159_984, 319_400]) {
      const w = win(scrollTop);
      expect(w.end - w.start).toBeLessThanOrEqual(19 + 1 + 8);
    }
  });

  it('positions the window at the scroll offset, snapped to a row', () => {
    const w = win(1_000);
    // 1000 / 32 = 31.25 → first visible 31, minus overscan 4 → 27.
    expect(w.start).toBe(27);
    expect(w.offsetTop).toBe(27 * 32);
    // (1000 + 600) / 32 = 50 → last visible 50, plus overscan → 54.
    expect(w.end).toBe(54);
  });

  it('clamps at the end of the list', () => {
    const w = win(319_400);
    expect(w.end).toBe(10_000);
    expect(w.start).toBe(10_000 - 19 - 4);
  });

  it('clamps a scroll position past the end, as the browser would', () => {
    expect(win(10_000_000)).toEqual(win(320_000 - 600));
  });

  it('clamps a negative scroll position', () => {
    expect(win(-500)).toEqual(win(0));
  });

  it('renders every row when the content is shorter than the viewport', () => {
    const w = computeWindow(5, 32, 600, 0, 4);
    expect(w).toEqual({ start: 0, end: 5, offsetTop: 0, totalHeight: 160 });
  });

  it('renders nothing for an empty list, but still reports zero height', () => {
    expect(computeWindow(0, 32, 600, 0, 4)).toEqual({
      start: 0,
      end: 0,
      offsetTop: 0,
      totalHeight: 0,
    });
  });

  it('renders nothing until the viewport has a height', () => {
    // A viewport measured before layout is 0px tall; rendering rows for it
    // would flash content that is immediately replaced.
    const w = computeWindow(10_000, 32, 0, 0, 4);
    expect(w.end - w.start).toBe(0);
    expect(w.totalHeight).toBe(320_000);
  });

  it('honours zero overscan', () => {
    const w = computeWindow(10_000, 32, 640, 0, 0);
    expect(w).toEqual({ start: 0, end: 20, offsetTop: 0, totalHeight: 320_000 });
  });

  it('handles a fractional scroll position', () => {
    const w = win(31.9);
    expect(w.start).toBe(0);
    expect(w.offsetTop).toBe(0);
  });
});

describe('scrollTopFor', () => {
  it('does not scroll for a row already in view', () => {
    expect(scrollTopFor(5, 32, 600, 0)).toBe(0);
  });

  it('scrolls down just enough to reveal a row below the viewport', () => {
    // Row 30 spans 960..992; viewport shows 0..600 → bottom must reach 992.
    expect(scrollTopFor(30, 32, 600, 0)).toBe(392);
  });

  it('scrolls up to the row top for a row above the viewport', () => {
    expect(scrollTopFor(3, 32, 600, 1_000)).toBe(96);
  });

  it('scrolls one row at a time when arrowing off the bottom edge', () => {
    // Rows 0..18 fully visible at scrollTop 0 (18 ends at 608 > 600, so 18 is partial).
    const step1 = scrollTopFor(18, 32, 600, 0);
    expect(step1).toBe(8);
    const step2 = scrollTopFor(19, 32, 600, step1);
    expect(step2).toBe(40);
  });
});
