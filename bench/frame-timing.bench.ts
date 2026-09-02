import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

/**
 * Frame timing under load, recorded rather than asserted.
 *
 * Runs the live feed at 20 000 events/s for a few seconds and samples the
 * interval between animation frames. p50 says what a typical frame costs;
 * p95 says how bad the bad ones are; `long` counts frames over 34 ms — two
 * missed vsyncs — which is the threshold a person perceives as a stutter.
 *
 * The output is a JSON file and a Markdown table. In CI the table goes to the
 * step summary, so a change in the numbers is visible on the run page next to
 * the commit that caused it — without any of it being able to fail the build.
 */
interface Sample {
  frames: number;
  p50: number;
  p95: number;
  max: number;
  long: number;
  events: number;
  commits: number;
  rows: number;
  heapMB: number | null;
}

const DURATION_MS = 4_000;
const RATE = '20000';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

test('frame timing at 20k events/s', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.locator('.app-status [data-status]')).toHaveAttribute(
    'data-status',
    'connected',
  );
  await page.getByRole('combobox', { name: 'Events per second' }).selectOption(RATE);
  // Let the rate change settle before measuring.
  await page.waitForTimeout(500);

  const raw = await page.evaluate(
    (duration) =>
      new Promise<{
        intervals: number[];
        events: number;
        commits: number;
        rows: number;
        heap: number | null;
      }>((resolve) => {
        const bar = document.querySelector('dl.stats')!;
        const read = () => ({
          commits: Number(bar.getAttribute('data-commits')),
          events: Number(bar.getAttribute('data-events')),
        });
        const start = read();
        const intervals: number[] = [];
        let last = performance.now();
        const deadline = last + duration;
        const tick = (now: number) => {
          intervals.push(now - last);
          last = now;
          if (now < deadline) {
            requestAnimationFrame(tick);
            return;
          }
          const end = read();
          const memory = (
            performance as unknown as { memory?: { usedJSHeapSize: number } }
          ).memory;
          resolve({
            intervals,
            events: end.events - start.events,
            commits: end.commits - start.commits,
            rows: document.querySelectorAll('[role="row"][data-index]').length,
            heap: memory ? memory.usedJSHeapSize : null,
          });
        };
        requestAnimationFrame(tick);
      }),
    DURATION_MS,
  );

  const sorted = [...raw.intervals].sort((a, b) => a - b);
  const seconds = DURATION_MS / 1000;
  const sample: Sample = {
    frames: raw.intervals.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? 0,
    long: raw.intervals.filter((ms) => ms > 34).length,
    events: Math.round(raw.events / seconds),
    commits: Math.round(raw.commits / seconds),
    rows: raw.rows,
    heapMB: raw.heap === null ? null : Math.round(raw.heap / 1_048_576),
  };

  const meta = {
    date: new Date().toISOString(),
    browser: browserName,
    rate: Number(RATE),
    durationMs: DURATION_MS,
    ci: Boolean(process.env.CI),
    runner: process.env.RUNNER_OS ?? process.platform,
  };

  await mkdir('bench-results', { recursive: true });
  await writeFile(
    'bench-results/frame-timing.json',
    JSON.stringify({ meta, sample }, null, 2),
    'utf8',
  );

  const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
  const table = [
    `### Frame timing — ${meta.rate.toLocaleString('en')} events/s, ${seconds}s, ${meta.browser}`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Frames sampled | ${sample.frames} |`,
    `| Frame interval p50 | ${fmt(sample.p50)} |`,
    `| Frame interval p95 | ${fmt(sample.p95)} |`,
    `| Frame interval max | ${fmt(sample.max)} |`,
    `| Frames over 34 ms | ${sample.long} |`,
    `| Events applied /s | ${sample.events.toLocaleString('en')} |`,
    `| Commits /s | ${sample.commits} |`,
    `| Rows in DOM | ${sample.rows} |`,
    `| JS heap | ${sample.heapMB === null ? 'n/a' : `${sample.heapMB} MB`} |`,
    '',
    '_Measured on a shared runner; compare trends between runs, not single values._',
    '',
  ].join('\n');
  await writeFile('bench-results/frame-timing.md', table, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, table);

  // The only assertions are structural — the same ones the e2e suite makes.
  // Timing is reported, never judged.
  expect(sample.rows).toBeLessThanOrEqual(80);
  expect(sample.commits).toBeLessThanOrEqual(70);
  console.log(table);
});
