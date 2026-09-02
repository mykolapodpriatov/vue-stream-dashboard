import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from './App.vue';
import { routes } from './router';

async function mountApp(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  return mount(App, { global: { plugins: [createPinia(), router] } });
}

describe('App shell', () => {
  it('renders the live feed at the root', async () => {
    const wrapper = await mountApp('/');
    expect(wrapper.get('h1').text()).toBe('Live feed');
  });

  it('puts the skip link first, targeting the main landmark', async () => {
    const wrapper = await mountApp('/');
    const first = wrapper.element.querySelector('a');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(wrapper.find('main#main').exists()).toBe(true);
  });

  it('marks the current page with aria-current, not colour alone', async () => {
    const wrapper = await mountApp('/settings');
    const current = wrapper.findAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.text()).toBe('Settings');
  });

  it('answers an unknown path with a 404 view', async () => {
    const wrapper = await mountApp('/nothing/here');
    expect(wrapper.get('h1').text()).toBe('Page not found');
  });
});
