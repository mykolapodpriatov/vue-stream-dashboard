import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createHarness } from '../../test/harness';
import { useFeedStore } from '@/stores/feed';
import { useSettingsStore } from '@/stores/settings';
import SettingsView from './SettingsView.vue';

async function mountView() {
  const h = createHarness();
  await h.router.push('/settings');
  await h.router.isReady();
  const feed = useFeedStore();
  feed.start();
  const wrapper = mount(SettingsView, { global: h.global, attachTo: document.body });
  return { wrapper, h, feed, settings: useSettingsStore() };
}

describe('SettingsView', () => {
  it('binds theme and language radios to the settings store', async () => {
    const { wrapper, settings } = await mountView();
    await wrapper.get('input[name="theme"][value="dark"]').setValue(true);
    expect(settings.theme).toBe('dark');
    await wrapper.get('input[name="locale"][value="ru"]').setValue(true);
    expect(settings.locale).toBe('ru');
    // Applying the locale to i18n and <html> is the shell's job (App.spec).
    wrapper.unmount();
  });

  it('binds fleet size, rate, seed and dirty wire', async () => {
    const { wrapper, settings } = await mountView();
    const selects = wrapper.findAll('select');
    await selects[0]!.setValue('1000');
    await selects[1]!.setValue('100');
    expect(settings.instruments).toBe(1_000);
    expect(settings.ratePerSecond).toBe(100);

    await wrapper.get('#fleet-seed').setValue('42.9');
    await wrapper.get('#fleet-seed').trigger('change');
    expect(settings.seed).toBe(42);

    await wrapper.get('#fleet-dirty').setValue(true);
    expect(settings.dirtyWire).toBe(true);
    wrapper.unmount();
  });

  it('applies fleet settings by restarting the feed with the new fleet', async () => {
    const { wrapper, h, feed } = await mountView();
    await wrapper.findAll('select')[0]!.setValue('1000');
    await wrapper.get('button.settings__apply').trigger('click');
    expect(feed.snapshot.rows).toHaveLength(1_000);
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1]!.commands[0]).toMatchObject({ config: { instruments: 1_000 } });
    wrapper.unmount();
  });

  it('describes the seed and dirty-wire controls without polluting their names', async () => {
    const { wrapper } = await mountView();
    const seed = wrapper.get('#fleet-seed');
    expect(seed.attributes('aria-describedby')).toBe('fleet-seed-help');
    expect(wrapper.get('label[for="fleet-seed"]').text()).toBe('Seed');
    expect(wrapper.get('#fleet-seed-help').text()).toContain('Same seed');
    wrapper.unmount();
  });
});
