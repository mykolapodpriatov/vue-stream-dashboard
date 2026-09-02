# ADR-003: One source interface; replay is a first-class mode

- **Status:** accepted
- **Date:** 2026-09-02

## Context

A realtime dashboard whose only source is "live" cannot be tested
deterministically, cannot reproduce a bug someone saw yesterday, and cannot be
demonstrated without a backend. All three problems have the same shape: the
UI is coupled to one particular producer of events.

The design also needs a `step` mode — advance exactly one batch and stop — to
inspect what a single frame's worth of change looks like.

## Decision

Every producer implements one interface:

```ts
interface StreamSource<T> {
  connect(): AsyncIterable<readonly T[]>;
  close(): void;
}
```

Two implementations exist and the pipeline cannot tell them apart:
`LiveSource` (a seeded generator in a Web Worker) and `ReplaySource` (a
`Recording` played back at `1× · 10× · 100×`, or one batch per `step()`).

The interface is an `AsyncIterable` because its **pull** semantics give the
`step` mode for free: a consumer that does not call `next()` receives nothing,
and the source simply waits. Cancellation is also already defined — `break`
out of the loop and the iterator's `return()` runs the cleanup.

It yields **batches**, not events: at ten thousand events a second a promise
per event is the wrong shape.

It is **not** named `EventSource`, because the DOM already has one, and a type
that shadows a global is a bug that only appears in the file that forgot the
import.

## Alternatives considered

- **Callback subscription** (`subscribe(onBatch): unsubscribe`). Simpler for
  live, but `step` mode has to be bolted on as a special pause flag, and
  cancellation is a convention rather than a protocol.
- **RxJS / an observable library.** Solves the same problem with a dependency
  and a vocabulary nobody else in the codebase needs; async iteration is in
  the language.
- **Live only, mock in tests.** Mocks the worker in tests and leaves the
  "reproduce a bug" and "demo offline" problems unsolved.
- **Recordings as committed JSON fixtures.** The generator is deterministic
  from a seed, so a recording is described completely by its parameters.
  `createSyntheticRecording({ seed, … })` replaces a megabyte of fixture in
  git. Uploaded recordings are still real files, with strict validation.

## Consequences

- End-to-end tests run against real sources with deterministic content; the
  step-mode test asserts exactly one batch per click.
- A bug report can carry a `.json` recording, and the dashboard can be put
  into the state that produced it.
- Switching sources mid-session is a normal operation. That surfaced a real
  bug — the normalizer's sequence history survived the switch and rejected a
  replay from `seq 0` as stale — which is now fixed by construction: a new
  source starts a new sequence space.
- The live worker's protocol is socket-shaped (`open`, `batch`, `closed`) so
  that a transport layer expecting a socket — the composables kit's
  `useEventStream` — can sit in front of it without adapting the worker.
