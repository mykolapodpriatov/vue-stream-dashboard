import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createHarness } from '../test/harness';
import App from './App.vue';
import { useFeedStore } from './stores/feed';
import { useSettingsStore } from './stores/settings';

async function mountApp(path: string) {
  const h = createHarness();
  await h.router.push(path);
  await h.router.isReady();
  const wrapper = mount(App, { global: h.global, attachTo: document.body });
  return { wrapper, h };
}

describe('App shell', () => {
  it('renders the live feed at the root and starts the feed', async () => {
    const { wrapper, h } = await mountApp('/');
    expect(wrapper.get('h1').text()).toBe('Live feed');
    expect(useFeedStore().started).toBe(true);
    expect(h.workers).toHaveLength(1);
    wrapper.unmount();
  });

  it('puts the skip link first, targeting the main landmark', async () => {
    const { wrapper } = await mountApp('/');
    const first = wrapper.element.querySelector('a');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(first?.textContent).toBe('Skip to content');
    expect(wrapper.find('main#main').exists()).toBe(true);
    wrapper.unmount();
  });

  it('marks the current page with aria-current, not colour alone', async () => {
    const { wrapper } = await mountApp('/settings');
    const current = wrapper.findAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.text()).toBe('Settings');
    wrapper.unmount();
  });

  it('answers an unknown path with a 404 view', async () => {
    const { wrapper } = await mountApp('/nothing/here');
    expect(wrapper.get('h1').text()).toBe('Page not found');
    wrapper.unmount();
  });

  it('shows the connection status in the header as text', async () => {
    const { wrapper } = await mountApp('/');
    expect(wrapper.get('.app-status [data-status]').text()).toContain('Connected');
    wrapper.unmount();
  });

  it('announces connection changes through the live region', async () => {
    const { wrapper } = await mountApp('/');
    useFeedStore().stop();
    await flushPromises();
    expect(wrapper.get('[role="status"][aria-live="polite"]').text()).toBe(
      'Connection Offline',
    );
    wrapper.unmount();
  });

  it('switches language and document lang together', async () => {
    const { wrapper } = await mountApp('/');
    useSettingsStore().locale = 'ru';
    await nextTick();
    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('Лента');
    expect(document.documentElement.lang).toBe('ru');
    useSettingsStore().locale = 'en';
    await nextTick();
    wrapper.unmount();
  });

  it('applies the theme to <html> and removes it for system', async () => {
    const { wrapper } = await mountApp('/');
    const settings = useSettingsStore();
    settings.theme = 'dark';
    await nextTick();
    expect(document.documentElement.dataset.theme).toBe('dark');
    settings.theme = 'system';
    await nextTick();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    wrapper.unmount();
  });
});
