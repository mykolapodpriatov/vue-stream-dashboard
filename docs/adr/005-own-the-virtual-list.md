# ADR-005: A minimal fixed-height virtual grid of our own — and a documented line for when not to

- **Status:** accepted
- **Date:** 2026-09-02

## Context

The live feed shows 10 000 rows. The DOM cannot hold them all — not for
memory, and not because every snapshot commit would diff them. Virtualization
is required. The question is whether to write it or depend on it.

The design review made the point that "wrote my own virtualizer to show I
understand it" is a weaker signal than "knows how virtualization works _and_
knows when not to reinvent it".

## Decision

Write the minimum that demonstrates the principle, and draw the line in
writing.

The implementation is ~60 lines of arithmetic (`virtualWindow.ts`), a
composable that wraps it in a `computed`, and a component that owns the
accessibility contract: `role="grid"`, `aria-rowcount` for the rows that are
not in the DOM, `aria-rowindex` for the ones that are, and a roving active
row driven by the keyboard and announced through `aria-activedescendant`. Row
height is fixed. Scrolling is vertical. That is all.

`docs/virtualization.md` lists what is deliberately missing (variable heights,
horizontal, scroll anchoring, window scrolling, sticky groups) and compares
feature-by-feature with `@tanstack/vue-virtual`, ending with the rule:

> Write your own when every row is the same height and you need to know
> exactly what runs per frame. Use the library the moment either stops being
> true.

## Alternatives considered

- **Depend on `@tanstack/vue-virtual` from the start.** The right call for a
  product. For a repository whose thesis is about what runs per frame, it hides
  the one piece of the render path worth showing, and adds a dependency to
  reason about in the benchmark.
- **Write a general virtualizer.** Variable heights need measurement, a size
  cache and estimated offsets — most of a library, and none of the thesis.
  This is the outcome the design review warned against.
- **`content-visibility: auto`.** Skips painting off-screen rows but still
  creates 10 000 DOM nodes and diffs them; helps at hundreds, not thousands.
- **Pagination.** Virtualization with buttons instead of a scrollbar; hides
  the activity the dashboard exists to show.

## Consequences

- The DOM holds about 20–30 rows for any fleet size. This is asserted in unit
  tests (10 000 → 23), component tests, and end-to-end (≤ 80 at 20k events/s).
- Any row that is not exactly `itemHeight` tall breaks the arithmetic
  silently. The row style enforces the height; a design that needs wrapping
  cells must switch to the library, per the documented rule.
- The grid element is also the scroll container and the focus target. That is
  not a shortcut: `aria-activedescendant` has to sit on the focused element,
  and the accessibility linter's complaints about per-row click handlers were
  resolved by delegating from the grid rather than by suppressing the rule.
