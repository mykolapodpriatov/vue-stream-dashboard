import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createHarness } from '../../test/harness';
import { frame } from '../../test/fakeWorker';
import { useFeedStore } from '@/stores/feed';
import { useSettingsStore } from '@/stores/settings';
import LiveFeedView from './LiveFeedView.vue';

async function mountView() {
  const h = createHarness();
  useSettingsStore().instruments = 200;
  await h.router.push('/');
  await h.router.isReady();
  const feed = useFeedStore();
  feed.start();
  const wrapper = mount(LiveFeedView, { global: h.global, attachTo: document.body });
  return { wrapper, h, feed };
}

describe('LiveFeedView', () => {
  // happy-dom has no layout: give the grid a height and the header a smaller
  // one, so the virtual window has rows to render.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('virtual-list') ? 640 : 40;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the toolbar, stats and table together', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.get('h1').text()).toBe('Live feed');
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(5);
    expect(wrapper.get('dl.stats').text()).toContain('Rows in DOM');
    expect(wrapper.get('[role="grid"]').attributes('aria-rowcount')).toBe('201');
    wrapper.unmount();
  });

  it('reflects committed data and the stats once per frame', async () => {
    const { wrapper, h } = await mountView();
    h.workers[0]!.emitBatch([frame(0, 0, 60.5), frame(1, 1, 400), frame(2, 0, 61)]);
    await flushPromises();
    h.scheduler.tick(16);
    await nextTick();
    expect(wrapper.get('[data-index="0"]').text()).toContain('61.0');
    expect(wrapper.get('[data-stat="lastBatch"] dd').text()).toBe('3');
    expect(wrapper.get('dl.stats').attributes('data-commits')).toBe('1');
    expect(wrapper.get('dl.stats').attributes('data-events')).toBe('3');
    wrapper.unmount();
  });

  it('filters by name through the store', async () => {
    const { wrapper, feed } = await mountView();
    await wrapper.get('input[type="search"]').setValue('TMP-0000');
    expect(feed.query).toBe('TMP-0000');
    await nextTick();
    expect(wrapper.findAll('[role="row"][data-index]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('filters by quality through the store', async () => {
    const { wrapper, feed } = await mountView();
    await wrapper.get('select[id], .feed__filter select').setValue('bad');
    expect(feed.qualityFilter).toBe('bad');
    wrapper.unmount();
  });

  it('sorting from the header reaches the store', async () => {
    const { wrapper, feed } = await mountView();
    await wrapper.get('button[aria-label="Sort by Value"]').trigger('click');
    expect(feed.sortKey).toBe('value');
    wrapper.unmount();
  });

  it('selecting a row navigates to the instrument', async () => {
    const { wrapper, h } = await mountView();
    await wrapper.get('[data-index="3"]').trigger('click');
    // The instrument route is a lazy chunk; navigation settles after the import.
    await vi.waitFor(() => {
      expect(h.router.currentRoute.value.fullPath).toBe('/instrument/3');
    });
    wrapper.unmount();
  });
});
