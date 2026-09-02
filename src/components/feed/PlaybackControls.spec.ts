import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createHarness } from '../../../test/harness';
import { useFeedStore } from '@/stores/feed';
import { useSettingsStore } from '@/stores/settings';
import PlaybackControls from './PlaybackControls.vue';

function mountControls() {
  const h = createHarness();
  useSettingsStore().instruments = 20;
  const feed = useFeedStore();
  feed.start();
  const wrapper = mount(PlaybackControls, { global: h.global });
  return { wrapper, feed, h };
}

describe('PlaybackControls', () => {
  it('offers the five modes as one radio group with live checked', () => {
    const { wrapper } = mountControls();
    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.attributes('value'))).toEqual([
      'live',
      '1x',
      '10x',
      '100x',
      'step',
    ]);
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.get('fieldset legend').text()).toBe('Playback');
  });

  it('switches mode and swaps the rate control for the position readout', async () => {
    const { wrapper, feed } = mountControls();
    expect(wrapper.find('.playback__rate').exists()).toBe(true);
    await wrapper.findAll('input[type="radio"]')[4]!.trigger('change');
    expect(feed.mode).toBe('step');
    expect(wrapper.find('.playback__rate').exists()).toBe(false);
    expect(wrapper.get('[data-action="step"]').text()).toBe('Next batch');
    expect(wrapper.get('.playback__position').text()).toMatch(/^0 of \d+ batches$/);
  });

  it('pause toggles with aria-pressed and the label', async () => {
    const { wrapper, feed } = mountControls();
    const pause = wrapper.get('[data-action="pause"]');
    expect(pause.text()).toBe('Pause');
    await pause.trigger('click');
    expect(feed.paused).toBe(true);
    expect(pause.attributes('aria-pressed')).toBe('true');
    expect(pause.text()).toBe('Resume');
    await pause.trigger('click');
    expect(feed.paused).toBe(false);
  });

  it('changing the rate reaches the settings and the worker', async () => {
    const { wrapper, h } = mountControls();
    await wrapper.get('select').setValue('20000');
    expect(useSettingsStore().ratePerSecond).toBe(20_000);
    expect(h.workers[0]!.commands.at(-1)).toEqual({
      type: 'configure',
      ratePerSecond: 20_000,
    });
  });
});
