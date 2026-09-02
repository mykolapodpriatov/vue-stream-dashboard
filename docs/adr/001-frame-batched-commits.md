# ADR-001: Commit to reactive state once per animation frame, not once per event

- **Status:** accepted
- **Date:** 2026-09-02

## Context

The feed delivers thousands of events a second — the demo runs at 5 000 by
default and 20 000 without complaint. Vue's reactivity is designed for user
interaction rates: a keystroke, a click, a response arriving. Every write to a
`ref` or a `reactive` object notifies its dependents and enqueues a scheduler
job; Vue coalesces those jobs, but the notification and enqueue work is paid
per write. At 20 000 writes a second, the framework spends most of a frame on
bookkeeping before it has rendered anything.

Two things are true at once and have to be reconciled:

1. Nobody can perceive more than one update per paint. A value that changed
   three times in 16 ms looks identical to one that changed once.
2. The DOM must reflect the newest data on every paint — a dashboard that lags
   the feed by a second is broken in a way users notice immediately.

## Decision

Events are never written to reactive state. They are appended to a ring
buffer as they arrive. When the browser is about to paint —
`requestAnimationFrame` — the buffer is drained, the whole batch is applied to
plain, non-reactive row objects, and **one** `shallowRef` is assigned a new
snapshot. That assignment is the only reactive write in the entire path, and
it happens at most once per frame regardless of the event rate.

```
frames → normalizer → ring buffer → rAF → apply → snapshot → shallowRef → render
```

A frame with nothing pending is not a commit: the scheduler is only asked for
a frame when something has arrived, so an idle feed costs nothing.

## Alternatives considered

- **Write to reactive state per event and let Vue coalesce.** Vue does
  coalesce renders, but not the dependency notifications. Measured against
  the current design in the benchmark harness it saturates the main thread
  well before 20 000 events a second. It is also the version everybody writes
  first, which is why this repository exists.
- **Throttle with `setTimeout`.** Works, but decouples updates from the paint
  cycle: a 16 ms timer and a 16 ms frame drift against each other, producing
  frames that commit twice and frames that commit nothing. `rAF` is the only
  primitive that is _defined_ to run once per paint.
- **Debounce until the stream goes quiet.** A live feed never goes quiet. This
  is the design that shows a frozen table until the user pauses it.
- **Apply per event, render per frame with `v-memo`.** Halves the problem but
  keeps the per-event reactive writes, which are the expensive half.

## Consequences

- The UI is guaranteed to render at most once per frame, however many events
  arrive. This is testable without a browser: the batcher takes an injectable
  scheduler, and the unit tests assert "500 events across 5 frames is 5
  commits" directly.
- Everything between two frames is invisible by construction. Consumers that
  need every event — a recorder, a per-event audit — tap the source, not the
  snapshot. The recorder in this repository does exactly that.
- Backpressure is explicit: if a frame is late, the ring buffer overwrites its
  oldest entries and counts them. The stats bar shows `Dropped`. Silent loss is
  the failure mode this rules out.
- Nothing in the pipeline is reactive, so nothing in it can be accidentally
  bound to a template. That is a constraint on contributors as much as a
  benefit, and `ARCHITECTURE.md` says so.
