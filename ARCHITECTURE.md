# Architecture

<!-- For the engineer who read the README, got interested, and wants to know
     whether the inside is as considered as the outside. -->

## Goals

In priority order:

1. **The DOM never does per-event work.** Whatever the event rate, the
   render loop runs at most once per animation frame and touches at most the
   visible rows. This is the thesis; everything else serves it.
2. **The same UI runs on live data and on a recording, and cannot tell the
   difference.** Reproducible bugs, deterministic tests, offline demo — one
   mechanism.
3. **Failure is visible.** Dropped events are counted, rejected frames are
   counted by reason, connection state is a word. Nothing degrades silently.
4. **Accessible by construction.** The virtual grid, the status indicators
   and the charts are usable without a mouse, without colour and without
   sight — and that is asserted, not assumed.

## Non-goals

- **Being a charting or dashboard product.** One table, one sparkline. The
  interesting code is between the socket and the DOM, not in the widgets.
- **A general virtualization library.** Fixed row height, vertical only. The
  line is drawn in [`docs/virtualization.md`](./docs/virtualization.md).
- **A real backend.** The live source is a Web Worker generating a synthetic
  fleet from a seed. The worker's protocol is socket-shaped so a real
  transport can replace it, but the repository does not ship one.
- **Persisting anything.** Settings live in memory. Persistence that survives
  a hostile browser belongs to the composables kit and arrives with it.
- **Per-event history.** Charts sample the committed snapshot once per frame.
  Anything that needs every event taps the source (the recorder does).

## System boundaries

```
┌──────────────────────── browser tab ─────────────────────────┐
│                                                              │
│  ┌── Web Worker ──────────┐    ┌── main thread ───────────┐  │
│  │ seeded generator        │    │ StreamSource<WireFrame>  │  │
│  │ (mulberry32, random     │───▶│  ├─ LiveSource (worker)  │  │
│  │  walks per instrument)  │    │  └─ ReplaySource (file)  │  │
│  │ open / batch / closed   │    │            │             │  │
│  │ faults: stall, drop     │    │            ▼             │  │
│  └─────────────────────────┘    │  normalizer → ring →     │  │
│                                 │  rAF → apply → snapshot  │  │
│  ┌── recording (.json) ────┐    │            │             │  │
│  │ version · meta · frames │◀──▶│     shallowRef<Snapshot> │  │
│  └─────────────────────────┘    │            │             │  │
│                                 │  Pinia stores → views    │  │
│                                 │  virtual grid · canvas   │  │
│                                 └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Inside this repository:** everything above. **It talks to:** nothing over
the network. **It assumes:** a browser with `Worker`, `requestAnimationFrame`
and `ResizeObserver` — every evergreen browser since 2020.

The trust boundary is the normalizer. Everything upstream is `unknown`;
everything downstream is a typed `TelemetryEvent`. A recording loaded from
disk and a batch from the worker are treated identically: untrusted until
validated.

## Data flow

```
                events arrive whenever they arrive
                              │
   [ WireFrame tuples ]       ▼
   ────────────────▶  normalizer  ── malformed / duplicate / stale ──▶ counters
                              │ TelemetryEvent
                              ▼
                        ring buffer   ── overflow ──▶ dropped counter
                              │
              (one requestAnimationFrame per paint)
                              │
                              ▼
        apply batch to plain row objects  (mutation, not reactivity)
                              │
                              ▼
        snapshot = { frame, at, rows, updated, seq }
                              │
                              ▼
        shallowRef.value = snapshot          ◀── the ONE reactive write
                              │
             ┌────────────────┼──────────────────┐
             ▼                ▼                  ▼
      order = computed   stats = shallowRef   history (watch, per id)
      (index array,      (also per frame)     (sparkline points)
       filter + sort)
             │
             ▼
      VirtualList: window = computed(scrollTop, viewport, count)
             │
             ▼
      ≤ ~30 <div role="row"> in the DOM
```

Three properties fall out of this shape:

- **Vue sees one write per frame.** `snapshot` and `stats` are `shallowRef`s
  replaced in the flush callback. Nothing per event touches the reactivity
  graph. ([ADR-001](./docs/adr/001-frame-batched-commits.md))
- **The snapshot is a version marker.** Rows are stable objects mutated
  between commits; the snapshot wrapper is new so the ref triggers. No
  per-frame copy of 10 000 rows.
  ([ADR-002](./docs/adr/002-snapshot-is-a-version-marker.md))
- **Sources are interchangeable.** The pipeline consumes an
  `AsyncIterable<readonly WireFrame[]>`; live and replay both provide one.
  ([ADR-003](./docs/adr/003-one-source-interface-with-replay.md))

## Failure modes

| What breaks                                    | How it is detected                           | What happens                                                                                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A frame is late (tab hidden, main thread busy) | ring buffer reaches capacity                 | oldest events overwritten, `dropped` counted and shown; newest data wins                                                                                                                                |
| Malformed frame on the wire                    | normalizer shape/finiteness/code checks      | dropped, counted as `malformed`; never reaches the DOM                                                                                                                                                  |
| Duplicate or out-of-order frame                | `seq % window` ring                          | duplicates dropped; late-but-new frames accepted and counted as `reordered`; gaps counted and filled                                                                                                    |
| Frame older than the dedup window              | `seq ≤ highest − window`                     | dropped as `stale` rather than trusted                                                                                                                                                                  |
| Source switched mid-session                    | `run()` on the pipeline                      | sequence history forgotten; counters carry on. Found by the e2e suite, not by reasoning                                                                                                                 |
| Worker closes (drop fault, crash)              | `closed` message / `onerror`                 | iteration ends; status → **Offline**; user reconnects                                                                                                                                                   |
| Worker goes silent without closing (stall)     | **not yet detected** — the zombie connection | status stays **Connected**; only "last data N s ago" reveals it. The composables kit's stall watchdog closes this gap; the e2e test that documents the current behaviour flips to `Stale` when it lands |
| Recording file is not a recording              | `parseRecording` throws `SyntaxError`        | error shown in place, `role="alert"`; nothing else changes                                                                                                                                              |
| Recording's fleet differs from settings        | `meta.instruments`                           | fleet resized, readings discarded, mode → 1×                                                                                                                                                            |
| Route chunk fails to load after a deploy       | _not yet handled_                            | vue-router aborts navigation silently. `lazyImport` from the kit will retry and reload once                                                                                                             |

Handled badly on purpose: **paused for a long time.** The ring buffer holds
32 768 events (~1.6 s at 20k/s); pausing longer than that loses the oldest
events, and the `Dropped` counter says so. Growing the buffer without bound
would trade a visible, bounded loss for an invisible, unbounded memory leak.

## Performance considerations

The workload that stresses the design is _sustained_ high rate — not a
burst. A burst is what the ring buffer is for; sustained load is what the
frame cadence is for.

**Per event** (in `ingest`): one array-shape check, five number checks, one
typed-array read for dedup, one push into the ring. No allocation beyond the
`TelemetryEvent` object itself.

**Per frame** (in `onFlush`): drain the ring into a reused array; for each
event five property writes on a plain object; build the `updated` list (size
of the batch, not the fleet); one snapshot object; one stats object; two
`shallowRef` writes.

**Per frame, downstream:**

- `order`: identity when unsorted and unfiltered (the default). Otherwise a
  filter pass over the fleet and a sort of an index array — the single most
  expensive step, ~1–2 ms for 10 000 rows, and it runs only when something
  renders it.
- `VirtualList`: the window `computed` depends on scroll position and size,
  **not** on the data; a commit re-renders the rows in the window without
  recomputing which rows they are.
- Table cells: `Intl.NumberFormat` / `DateTimeFormat` through `vue-i18n`, for
  ~25 rows.
- Sparkline: one `clearRect`, two `stroke`s, on a canvas — the DOM does not
  grow with the series.

**Measured** (Chromium, 4 s at 20 000 events/s, local machine — see the
`benchmark` CI job for the runner's numbers):

| Metric                         | Value              |
| ------------------------------ | ------------------ |
| Frame interval p50 / p95 / max | 8.3 / 9.2 / 9.4 ms |
| Frames over 34 ms              | 0                  |
| Events applied /s              | 19 986             |
| Commits /s                     | 50                 |
| Rows in DOM                    | 16                 |
| JS heap                        | 17 MB              |

**Not measured:** memory over hours; behaviour on low-end mobile; anything
about a real network.

**Known cost centres, in order:** sorting by a dynamic key; the per-row
formatters; structured-clone of tuple arrays from the worker (a transferable
`Float64Array` would be cheaper, and is a contained change inside
`liveWorkerCore`).

## Testing strategy

| Layer                                                        | Covers                                                                                                                                                                             | Deliberately does not try to catch                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Unit** (Vitest, 237) — pipeline, sources, ordering, stores | the batching invariant with a hand-driven scheduler ("500 events, 5 frames, 5 commits"); normalizer edge cases; replay pacing with fake timers; store lifecycle with a fake worker | anything about layout, paint or a real `Worker`                                                |
| **Component** (Vue Test Utils) — grid, table, views          | 10 000 rows → 23 in the DOM; ARIA attributes; keyboard navigation; header/row parity                                                                                               | visual correctness; real scroll geometry (happy-dom has no layout)                             |
| **End-to-end** (Playwright, 31) — built bundle in Chromium   | the real worker, real downloads and uploads, real keyboard events; axe on every screen in both themes and both languages                                                           | timing                                                                                         |
| **Structural invariants** (Playwright)                       | DOM rows ≤ 80; commits ≤ frames; backlog → ≤ 3 commits                                                                                                                             | milliseconds — by design ([ADR-004](./docs/adr/004-structural-invariants-not-milliseconds.md)) |
| **Benchmark** (Playwright, non-gating)                       | frame-interval distribution, throughput, heap                                                                                                                                      | pass/fail — it records, it does not judge                                                      |

Coverage thresholds are 85 / 78 / 82 / 85 (statements / branches /
functions / lines) against a measured 96 / 89 / 95 / 98. Below the
composables kit's 90 on purpose: this is an application, and the last
stretch is covered by Playwright rather than by mocking the browser until
the mock is the thing under test.

## Trade-offs

| Decision                                      | Cost                                                   | Revisit when                                                                          |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Frame-batched commits                         | everything between two paints is invisible to the UI   | never for the UI; anything needing every event taps the source                        |
| Mutable rows behind a version-marker snapshot | a row held outside render changes under the holder     | a consumer genuinely needs frozen views — give it a copy at that moment               |
| Fixed-height virtual list of our own          | no variable heights, no horizontal                     | any row stops being `itemHeight` tall — switch to `@tanstack/vue-virtual`             |
| Sorting an index array per commit             | ~1–2 ms/frame at 10k rows when a dynamic key is chosen | fleets of 100k+ — incremental re-sort or sort only the visible window's neighbourhood |
| Dedup by `seq % window`, drop older as stale  | a very late frame is lost                              | sources that legitimately deliver seconds late — widen the window or key on `ts`      |
| Tuples over the worker boundary               | structured-clone cost                                  | it shows up in the benchmark — switch to transferable typed arrays                    |
| Settings in memory                            | preferences reset on reload                            | the composables kit lands (`useLocalStorage`)                                         |
| No stall detection                            | a silent worker reads as connected                     | the composables kit lands (`useEventStream` watchdog)                                 |

## Future work

In the order worth doing:

1. **Adopt `@mykolapodpriatov/vue-composables-kit` as the npm dependency it
   was built to be.** `useEventStream` in front of the worker (stall
   watchdog → `Stale`, reconnect with backoff), `lazyImport` on the route
   chunks, `useLocalStorage` for settings, `useToastQueue` for the
   announcements. This is the repository's designed next step; it waits only
   on the package being published.
2. **Transferable typed arrays** from the worker, if the benchmark shows
   structured clone in the profile.
3. **`OffscreenCanvas`** for the sparkline when many instruments are open at
   once — not before.
4. **Recording compression** for long sessions; a recording is currently a
   plain JSON array of tuples.
