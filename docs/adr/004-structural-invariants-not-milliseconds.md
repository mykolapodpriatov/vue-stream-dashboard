# ADR-004: Gate CI on structural invariants; record milliseconds as artifacts

- **Status:** accepted
- **Date:** 2026-09-03

## Context

The repository's thesis is a performance claim. A performance claim with no
assertion behind it is folklore. The obvious assertion — "render 10 000 rows
in under X ms" — fails for a reason that has nothing to do with the code:
GitHub-hosted runners share hardware, and their timings vary by a factor of
two or three between runs. A gate on that number is red on Tuesdays, and a
gate that is red for no reason is a gate people learn to ignore.

## Decision

CI **gates** on properties that are about counting, not timing, and therefore
hold on a slow machine exactly as on a fast one:

| Invariant      | Assertion                                                       |
| -------------- | --------------------------------------------------------------- |
| Virtualization | 10 000 rows → DOM rows ≤ 80, at 20 000 events/s                 |
| Frame batching | in any window, commits ≤ animation frames (+1 for the boundary) |
| Backpressure   | a one-second paused backlog → thousands of events, ≤ 3 commits  |
| Batching ratio | events per commit ≫ 1 (asserted > 20 at 20k/s)                  |

These are asserted in-page with `requestAnimationFrame` counting and the
pipeline's own counters, which the stats bar exposes as `data-` attributes.

CI **records** milliseconds in a separate job that cannot fail the build:
frame-interval p50 / p95 / max, frames over 34 ms, events and commits per
second, DOM rows, heap. Results go to `bench-results/` as an artifact and to
the run's step summary, so a regression is visible on the run page next to
the commit that caused it.

## Alternatives considered

- **Absolute thresholds with generous margins.** A margin wide enough to
  survive runner noise is too wide to catch a real regression, and it still
  goes red occasionally. Worst of both.
- **Relative thresholds against a baseline run.** Needs a stable reference
  environment to be meaningful; a self-hosted runner is out of scope for a
  portfolio repository.
- **No benchmark at all.** Leaves the claim unmeasured. The numbers are the
  point; they just should not be the gate.
- **Benchmark in unit tests with fake timers.** Measures nothing about a
  browser.

## Consequences

- CI stays green for reasons that are always the code's fault when it is red.
- The bench job's numbers must be read as trends between runs, and the
  summary says so in its footer.
- The invariants are also the acceptance criteria for any future change to
  the pipeline: a proposal that breaks "commits ≤ frames" is a different
  architecture, not an optimisation.
