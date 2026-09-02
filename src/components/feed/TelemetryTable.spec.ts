import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createHarness } from '../../../test/harness';
import { computeOrder } from '@/feed/order';
import { createTelemetryState } from '@/pipeline/telemetryState';
import TelemetryTable from './TelemetryTable.vue';

/** Deterministic: two calls with the same count produce equal fleets. */
function fleet(count: number) {
  const state = createTelemetryState(count);
  state.apply([
    { seq: 0, ts: 1_700_000_000_000, instrumentId: 0, value: 61.25, quality: 'good' },
    { seq: 1, ts: 1_700_000_000_500, instrumentId: 0, value: 62.5, quality: 'suspect' },
    { seq: 2, ts: 1_700_000_001_000, instrumentId: 2, value: 24.4, quality: 'bad' },
  ]);
  return state.rows;
}

const natural = { sortKey: 'id', direction: 'asc', query: '', quality: 'all' } as const;

function mountTable(count = 10_000, extra: Record<string, unknown> = {}) {
  const h = createHarness();
  const rows = fleet(count);
  const wrapper = mount(TelemetryTable, {
    props: {
      rows,
      order: computeOrder(rows, natural),
      sortKey: 'id',
      sortDirection: 'asc',
      viewportHeight: 640,
      ...extra,
    },
    global: h.global,
    attachTo: document.body,
  });
  return wrapper;
}

describe('TelemetryTable', () => {
  it('renders a bounded number of rows for ten thousand instruments', async () => {
    const wrapper = mountTable();
    await nextTick();
    const rows = wrapper.findAll('[role="row"][data-index]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(80);
    expect(wrapper.emitted('rendered')?.at(-1)).toEqual([rows.length]);
    wrapper.unmount();
  });

  it('shows value with unit and precision, trend, quality and time for read rows', () => {
    const wrapper = mountTable(10);
    const first = wrapper.get('[data-index="0"]');
    expect(first.text()).toContain('TMP-00000');
    expect(first.text()).toContain('Temperature');
    expect(first.get('.table__cell--value').text()).toBe('62.5 °C');
    expect(first.get('.table__cell--trend').text()).toBe('▲');
    expect(first.get('.table__cell--quality').text()).toContain('Suspect');
    expect(first.get('.table__cell--updates').text()).toBe('2');
    expect(first.get('.table__cell--updated').text()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    wrapper.unmount();
  });

  it('marks unread rows as having no reading', () => {
    const wrapper = mountTable(10);
    const unread = wrapper.get('[data-index="1"]');
    expect(unread.get('.table__cell--value').text()).toBe('No reading yet');
    expect(unread.get('.table__cell--quality').text()).toBe('');
    wrapper.unmount();
  });

  it('has one header cell per row cell, in the same order', () => {
    const wrapper = mountTable(10);
    // The default sort marks the Name column with an arrow; compare labels only.
    const headers = wrapper
      .findAll('[role="columnheader"]')
      .map((h) => h.text().replace(/\s*[↑↓]$/, ''));
    expect(headers).toEqual([
      'Name',
      'Kind',
      'Value',
      'Trend',
      'Quality',
      'Updated',
      'Updates',
    ]);
    expect(wrapper.get('[data-index="0"]').findAll('[role="gridcell"]')).toHaveLength(7);
    wrapper.unmount();
  });

  it('exposes the sort state through aria-sort and emits sort requests', async () => {
    const wrapper = mountTable(10, { sortKey: 'value', sortDirection: 'desc' });
    const headers = wrapper.findAll('[role="columnheader"]');
    const sorted = headers.filter(
      (header) => header.attributes('aria-sort') === 'descending',
    );
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.text()).toContain('Value');
    // Trend cannot be sorted: no aria-sort, no button.
    expect(headers[3]!.attributes('aria-sort')).toBeUndefined();
    expect(headers[3]!.find('button').exists()).toBe(false);

    await headers[5]!.get('button').trigger('click');
    expect(wrapper.emitted('sort')).toEqual([['ts']]);
    wrapper.unmount();
  });

  it('maps a selected row back to its instrument id through the order', async () => {
    const reversed = computeOrder(fleet(10), { ...natural, direction: 'desc' });
    const wrapper = mountTable(10, { order: reversed });
    await wrapper.get('[data-index="0"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[9]]);
    wrapper.unmount();
  });

  it('shows the empty message when nothing matches', () => {
    const wrapper = mountTable(10, { order: [] });
    expect(wrapper.text()).toContain('No instruments match the filter.');
    wrapper.unmount();
  });
});
