# ADR-002: The snapshot is a version marker, not an immutable copy

- **Status:** accepted
- **Date:** 2026-09-02

## Context

ADR-001 commits one snapshot per frame. The obvious shape for a snapshot is
an immutable copy of the state — a new array of new row objects — so that
each frame's view is frozen and independent. With 10 000 instruments at 60
frames a second, that is 600 000 allocations a second before any rendering
has happened, and the garbage collector becomes the thing that decides the
frame rate.

## Decision

Rows are plain, mutable objects that live for the lifetime of the fleet. They
are **never** wrapped in `reactive()` or `ref()`. Between commits the batch is
applied to them in place. The snapshot published through the `shallowRef` is
a small wrapper — frame number, timestamp, the _same_ `rows` array, and the
list of ids that changed — whose only job is to be a new object reference so
the `shallowRef` triggers.

This is safe because of three facts that hold together:

1. Components read row fields only during render.
2. Render runs only when the snapshot changes.
3. The snapshot changes only _after_ the entire batch has been applied.

So no render ever observes a half-applied frame, and the immutability a copy
would have provided is never actually needed.

## Alternatives considered

- **Deep-copy per frame.** Correct and simple, and the frame budget goes to
  garbage. Rejected on measurement, not principle.
- **Structural sharing (persistent data structures).** Immutability at a
  fraction of the copy cost, but a dependency and a mental model that nothing
  else in a Vue application uses. The guarantee it buys is one the render
  cadence already provides.
- **`reactive()` rows with `shallowRef` around them.** Makes every row write a
  reactive write again — precisely what ADR-001 removes.
- **`markRaw()` rows inside a reactive collection.** Equivalent in effect to
  the chosen design, but expresses the intent as an exception ("this reactive
  thing is not reactive") rather than a rule ("nothing in the pipeline is
  reactive").

## Consequences

- Per-frame allocation is bounded by the size of the _batch_ (the `updated`
  id list), not the size of the fleet.
- The rows array is shared across snapshots, so two snapshots cannot be
  compared for differences by comparing rows. The `updated` list is the diff.
- A component that stores a row object and reads it _outside_ render — in a
  timer, say — will see it change under it. That is the contract, documented
  on the `Snapshot` type; the instrument history composable is the example of
  doing this correctly (it samples on commit, via `watch`).
- Anything that wants a frozen view — the recorder, a bug-report export — takes
  it from the source or serialises at that moment. It does not hold a snapshot.
