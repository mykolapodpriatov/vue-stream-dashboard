/**
 * The arithmetic of a fixed-height virtual list, kept free of Vue and the DOM
 * so it can be tested against every edge without a browser.
 */
export interface VirtualWindow {
  /** First rendered index, inclusive. */
  readonly start: number;
  /** Last rendered index, exclusive. */
  readonly end: number;
  /** Pixels between the top of the content and the first rendered row. */
  readonly offsetTop: number;
  /** Height the scroll container must believe the content has. */
  readonly totalHeight: number;
}

/**
 * Which rows to render for a scroll position.
 *
 * `overscan` rows are rendered beyond each edge of the viewport so a fast
 * scroll shows content rather than blank space while the next frame catches
 * up. It is the one knob in the design: more overscan means fewer blanks and
 * more DOM.
 */
export function computeWindow(
  count: number,
  itemHeight: number,
  viewportHeight: number,
  scrollTop: number,
  overscan: number,
): VirtualWindow {
  const totalHeight = count * itemHeight;
  if (count <= 0 || itemHeight <= 0 || viewportHeight <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: Math.max(0, totalHeight) };
  }
  // The scroll position the browser will actually settle on: it clamps, and so
  // must we, or a stale `scrollTop` after a shrink renders rows past the end.
  const maxScroll = Math.max(0, totalHeight - viewportHeight);
  const top = Math.min(Math.max(0, scrollTop), maxScroll);

  const firstVisible = Math.floor(top / itemHeight);
  const lastVisible = Math.ceil((top + viewportHeight) / itemHeight);

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, lastVisible + overscan);
  return { start, end, offsetTop: start * itemHeight, totalHeight };
}

/**
 * The smallest scroll change that brings `index` fully into view — none if it
 * already is. This is what keyboard navigation uses, so arrowing through rows
 * scrolls one row at a time instead of jumping the active row to the top.
 */
export function scrollTopFor(
  index: number,
  itemHeight: number,
  viewportHeight: number,
  scrollTop: number,
): number {
  const rowTop = index * itemHeight;
  const rowBottom = rowTop + itemHeight;
  if (rowTop < scrollTop) return rowTop;
  if (rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight;
  return scrollTop;
}
