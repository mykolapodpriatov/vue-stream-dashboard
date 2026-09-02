import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import VirtualList from './VirtualList.vue';

function mountList(count = 10_000, extra: Record<string, unknown> = {}) {
  return mount(VirtualList, {
    props: { count, itemHeight: 32, viewportHeight: 600, label: 'Instruments', ...extra },
    slots: {
      header: '<div role="row"><span role="columnheader">Name</span></div>',
      row: `<template #row="{ index, active }">
        <span role="gridcell">Row {{ index }}{{ active ? ' (active)' : '' }}</span>
      </template>`,
    },
    attachTo: document.body,
  });
}

describe('VirtualList', () => {
  it('renders a bounded number of rows for ten thousand items', () => {
    const wrapper = mountList();
    const rows = wrapper.findAll('[role="row"][data-index]');
    // 19 visible + 4 overscan below (none above at the top).
    expect(rows).toHaveLength(23);
    expect(rows.length).toBeLessThanOrEqual(80);
    expect(rows[0]!.text()).toBe('Row 0 (active)');
    wrapper.unmount();
  });

  it('tells assistive technology about every row, not just the rendered ones', () => {
    const wrapper = mountList();
    const grid = wrapper.get('[role="grid"]');
    expect(grid.attributes('aria-label')).toBe('Instruments');
    // 10 000 data rows plus the header row.
    expect(grid.attributes('aria-rowcount')).toBe('10001');
    // Data rows are numbered after the header.
    expect(wrapper.get('[data-index="0"]').attributes('aria-rowindex')).toBe('2');
    expect(grid.attributes('aria-activedescendant')).toBe('virtual-row-0');
    wrapper.unmount();
  });

  it('moves the window when the viewport scrolls', async () => {
    const wrapper = mountList();
    const viewport = wrapper.get('[role="grid"]');
    viewport.element.scrollTop = 3_200;
    await viewport.trigger('scroll');
    const first = wrapper.findAll('[data-index]')[0]!;
    expect(first.attributes('data-index')).toBe('96');
    expect(wrapper.get('.virtual-list__rows').attributes('style')).toContain(
      `translateY(${96 * 32}px)`,
    );
    wrapper.unmount();
  });

  it('gives the scroll container the full content height', () => {
    const wrapper = mountList();
    expect(wrapper.get('.virtual-list__spacer').attributes('style')).toContain(
      'height: 320000px',
    );
    wrapper.unmount();
  });

  it('arrow keys move the active row and keep it in view', async () => {
    const wrapper = mountList();
    const viewport = wrapper.get('[role="grid"]');

    await viewport.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([1]);

    await viewport.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([9_999]);
    // Scrolled so the last row is visible: 320000 - 600.
    expect(viewport.element.scrollTop).toBe(319_400);
    await nextTick();
    expect(wrapper.find('[data-index="9999"]').exists()).toBe(true);
    expect(wrapper.get('[role="grid"]').attributes('aria-activedescendant')).toBe(
      'virtual-row-9999',
    );

    await viewport.trigger('keydown', { key: 'Home' });
    expect(viewport.element.scrollTop).toBe(0);
    wrapper.unmount();
  });

  it('PageDown moves by a viewport of rows and clamps at the ends', async () => {
    const wrapper = mountList(30);
    const viewport = wrapper.get('[role="grid"]');
    await viewport.trigger('keydown', { key: 'PageDown' });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([18]);
    await viewport.trigger('keydown', { key: 'PageDown' });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([29]);
    await viewport.trigger('keydown', { key: 'ArrowUp' });
    await viewport.trigger('keydown', { key: 'PageUp' });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([10]);
    wrapper.unmount();
  });

  it('Enter selects the active row; clicking a row activates and selects it', async () => {
    const wrapper = mountList();
    const viewport = wrapper.get('[role="grid"]');
    await viewport.trigger('keydown', { key: 'ArrowDown' });
    await viewport.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toEqual([[1]]);

    await wrapper.get('[data-index="5"]').trigger('click');
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([5]);
    expect(wrapper.emitted('select')?.at(-1)).toEqual([5]);
    wrapper.unmount();
  });

  it('ignores keys it does not handle', async () => {
    const wrapper = mountList();
    await wrapper.get('[role="grid"]').trigger('keydown', { key: 'a' });
    expect(wrapper.emitted('update:activeIndex')).toBeUndefined();
    wrapper.unmount();
  });

  it('pulls the active row back inside when the list shrinks', async () => {
    const wrapper = mountList(100, { activeIndex: 90 });
    await wrapper.setProps({ count: 10 });
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([9]);
    wrapper.unmount();
  });

  it('shows the empty slot and no active descendant for an empty list', () => {
    const wrapper = mountList(0);
    expect(wrapper.get('.virtual-list__empty').text()).toBe('Nothing to show.');
    expect(
      wrapper.get('[role="grid"]').attributes('aria-activedescendant'),
    ).toBeUndefined();
    wrapper.unmount();
  });

  it('renders without a header and numbers rows from one', () => {
    const wrapper = mount(VirtualList, {
      props: { count: 5, itemHeight: 32, viewportHeight: 600, label: 'Plain' },
      slots: { row: '<template #row="{ index }"><span>{{ index }}</span></template>' },
    });
    expect(wrapper.get('[role="grid"]').attributes('aria-rowcount')).toBe('5');
    expect(wrapper.get('[data-index="0"]').attributes('aria-rowindex')).toBe('1');
  });
});
