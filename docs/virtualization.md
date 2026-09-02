# Virtualization: what is here, and when not to use it

The live feed renders ten thousand instruments. The DOM holds about thirty of
them at any moment. This document explains the thirty, and why the code that
picks them is 60 lines rather than a dependency.

## The principle

Rendering is proportional to what is visible, not to what exists.

```
┌─ scroll container (viewport, 600px) ──────────────────────┐
│ ┌─ spacer (count × rowHeight = 320 000px) ──────────────┐ │
│ │                                                       │ │
│ │  ┌─ translateY(offsetTop) ─────────────────────────┐  │ │
│ │  │ row 1 872                                       │  │ │  ← overscan
│ │  │ row 1 873                                       │  │ │
│ │  │ ...                                             │  │ │  ← visible
│ │  │ row 1 899                                       │  │ │
│ │  └─────────────────────────────────────────────────┘  │ │  ← overscan
│ │                                                       │ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

Three parts:

1. **A spacer** as tall as all rows would be, so the scrollbar is honest.
2. **A translated block** holding only the rows that intersect the viewport,
   plus a few rows of _overscan_ on each side so a fast scroll shows content
   while the next frame catches up.
3. **Arithmetic** turning `scrollTop` into `[start, end)` — about ten lines,
   in `virtualWindow.ts`, tested against every edge.

Because every row is the same height, `start` is a division and `offsetTop`
is a multiplication. No measuring, no caching, no estimates that drift.

## What the implementation here does

- Fixed row height, vertical only.
- Overscan as the single tuning knob (default 4 rows each side).
- Clamps `scrollTop` the way the browser will, so a stale value after the
  list shrinks cannot render rows past the end.
- Grid semantics for assistive technology: `role="grid"`, `aria-rowcount`
  for the rows not in the DOM, `aria-rowindex` on the ones that are, and a
  roving active row (`ArrowUp/Down`, `PageUp/Down`, `Home/End`) announced
  through `aria-activedescendant`. Focus stays on the viewport; the active
  row never has to exist in the DOM to be the active row.
- The window is a `computed` over four numbers. A data commit re-renders the
  rows inside the window; it does **not** recompute the window.

## What it deliberately does not do

| Missing                     | Why it is missing                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Variable row heights        | Needs measurement, a size cache and estimated offsets; that is most of a virtualization library and none of this repository's point. |
| Horizontal virtualization   | The table has seven columns.                                                                                                         |
| Scroll anchoring on prepend | Rows never prepend here; the fleet is fixed and rows update in place.                                                                |
| Smooth `scrollIntoView`     | `prefers-reduced-motion` is honoured by not animating at all.                                                                        |
| Sticky rows / grouping      | Not a requirement of a flat fleet.                                                                                                   |
| Window / body scrolling     | The list scrolls in its own container.                                                                                               |

Each of these is a real feature that real dashboards need. Adding them here
would turn a demonstration of a principle into a half-finished copy of a
library that already exists.

## The library you would use instead

[`@tanstack/vue-virtual`](https://tanstack.com/virtual/latest) is the
maintained, framework-agnostic virtualizer. Compared with the code here it
adds:

- **Dynamic sizes** via `measureElement`, with an estimate for unmeasured rows.
- **Horizontal and grid** virtualization (rows × columns).
- **Scroll to index / offset** with alignment options and smooth behaviour.
- **Padding, gaps, scroll margin** for lists that are not the whole container.
- **Window scrolling** (`useWindowVirtualizer`) for lists embedded in a page.
- **Range extraction hooks** for sticky items.

It costs about 5 kB gzipped and one dependency to follow. If any row in your
list is a different height from any other, or if the list scrolls with the
page, use it — and do not write the thing in this directory.

## The rule of thumb

> Write your own when every row is the same height and you need to know
> exactly what runs per frame. Use the library the moment either stops being
> true.

Both halves of that sentence describe a decision, and the second half is the
one that keeps a portfolio piece from becoming a maintenance burden.

## Alternatives worth knowing

- **`content-visibility: auto`** lets the browser skip rendering off-screen
  subtrees without any JavaScript. It still creates the DOM nodes, so it
  helps paint cost, not memory or the initial render of ten thousand rows —
  useful for a few hundred, not for ten thousand.
- **Pagination** is virtualization with the scrollbar replaced by buttons. For
  a live feed where the interesting row could be anywhere, it hides the
  activity the dashboard exists to show.
