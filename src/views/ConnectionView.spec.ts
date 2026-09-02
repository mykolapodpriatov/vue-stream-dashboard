import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createHarness } from '../../test/harness';
import { useFeedStore } from '@/stores/feed';
import ConnectionView from './ConnectionView.vue';

async function mountView() {
  const h = createHarness();
  await h.router.push('/connection');
  await h.router.isReady();
  const feed = useFeedStore();
  feed.start();
  const wrapper = mount(ConnectionView, { global: h.global, attachTo: document.body });
  return { wrapper, h, feed };
}

describe('ConnectionView', () => {
  it('shows the status, transport and mode as words', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-status]').text()).toContain('Connected');
    expect(wrapper.text()).toContain('Web Worker');
    expect(wrapper.text()).toContain('Live');
    expect(wrapper.text()).toContain('never');
    wrapper.unmount();
  });

  it('fault buttons work in live mode and are disabled for replay', async () => {
    const { wrapper, h, feed } = await mountView();
    await wrapper.get('[data-fault="stall"]').trigger('click');
    expect(h.workers[0]!.commands.at(-1)).toEqual({ type: 'fault', fault: 'stall' });
    expect(wrapper.get('[data-fault="stall"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-fault="none"]').attributes('disabled')).toBeUndefined();

    feed.setMode('1x');
    await nextTick();
    expect(wrapper.get('[data-fault="stall"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-fault="drop"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('a drop shows offline; reconnect brings it back', async () => {
    const { wrapper, feed } = await mountView();
    await wrapper.get('[data-fault="drop"]').trigger('click');
    await flushPromises();
    expect(feed.status).toBe('offline');
    expect(wrapper.get('[data-status]').text()).toContain('Offline');
    await wrapper.get('[data-action="reconnect"]').trigger('click');
    expect(wrapper.get('[data-status]').text()).toContain('Connected');
    wrapper.unmount();
  });

  it('toggles recording', async () => {
    const { wrapper, feed } = await mountView();
    const button = wrapper.get('[data-action="record"]');
    await button.trigger('click');
    expect(feed.isRecording).toBe(true);
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.text()).toBe('Stop and download');
    wrapper.unmount();
  });

  it('reports a file that is not a recording without leaving the page', async () => {
    const { wrapper } = await mountView();
    const input = wrapper.get('input[type="file"]');
    const file = new File(['{"version":1}'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('not a recording');
    expect(alert.text()).toContain('meta');
    wrapper.unmount();
  });

  it('lists the normalizer counters', async () => {
    const { wrapper } = await mountView();
    for (const key of [
      'accepted',
      'malformed',
      'duplicate',
      'stale',
      'reordered',
      'gaps',
    ]) {
      expect(wrapper.find(`[data-stat="${key}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });
});
