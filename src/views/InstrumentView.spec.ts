import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createHarness } from '../../test/harness';
import { frame } from '../../test/fakeWorker';
import { useFeedStore } from '@/stores/feed';
import { useSettingsStore } from '@/stores/settings';
import InstrumentView from './InstrumentView.vue';

async function mountView(id: string) {
  const h = createHarness();
  useSettingsStore().instruments = 20;
  await h.router.push(`/instrument/${id}`);
  await h.router.isReady();
  const feed = useFeedStore();
  feed.start();
  const wrapper = mount(InstrumentView, {
    props: { id },
    global: h.global,
    attachTo: document.body,
  });
  return { wrapper, h, feed };
}

describe('InstrumentView', () => {
  it('names the instrument and reports no reading until one arrives', async () => {
    const { wrapper } = await mountView('7');
    expect(wrapper.get('h1').text()).toBe('FLW-00007');
    expect(wrapper.text()).toContain('Flow');
    expect(wrapper.text()).toContain('No reading yet');
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
      'FLW-00007: no readings yet',
    );
    wrapper.unmount();
  });

  it('shows the committed reading and grows the chart once per frame', async () => {
    const { wrapper, h } = await mountView('7');
    const worker = h.workers[0]!;
    worker.emitBatch([frame(0, 7, 24.36), frame(1, 7, 25.1, 1)]);
    await flushPromises();
    h.scheduler.tick(16);
    await nextTick();
    expect(wrapper.get('.instrument__number').text()).toBe('25.1');
    expect(wrapper.text()).toContain('Suspect');
    expect(wrapper.text()).toContain('Last 1 committed values');

    worker.emitBatch([frame(2, 7, 25.4)]);
    await flushPromises();
    h.scheduler.tick(32);
    await nextTick();
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
      'FLW-00007: 2 points, from 25.1 to 25.4 L/min, latest 25.4 L/min',
    );
    wrapper.unmount();
  });

  it('links to the neighbouring instruments, but not past the ends', async () => {
    const first = await mountView('0');
    expect(first.wrapper.text()).toContain('Next instrument');
    expect(first.wrapper.text()).not.toContain('Previous instrument');
    first.wrapper.unmount();

    const last = await mountView('19');
    expect(last.wrapper.text()).toContain('Previous instrument');
    expect(last.wrapper.text()).not.toContain('Next instrument');
    last.wrapper.unmount();
  });

  it('explains an id outside the fleet', async () => {
    const { wrapper } = await mountView('500');
    expect(wrapper.text()).toContain('There is no instrument 500 in a fleet of 20.');
    wrapper.unmount();
  });
});
