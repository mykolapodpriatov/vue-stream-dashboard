import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createHarness } from '../../../test/harness';
import type { ConnectionStatus as Status } from '@/stores/feed';
import ConnectionStatus from './ConnectionStatus.vue';
import QualityBadge from './QualityBadge.vue';

const STATUSES: Status[] = ['connected', 'reconnecting', 'offline', 'stale'];

describe('ConnectionStatus', () => {
  it('conveys each state as text and as a distinct shape, not colour alone', () => {
    const h = createHarness();
    const texts = new Set<string>();
    const glyphs = new Set<string>();
    for (const status of STATUSES) {
      const wrapper = mount(ConnectionStatus, { props: { status }, global: h.global });
      texts.add(wrapper.get('.conn__text').text());
      glyphs.add(wrapper.get('[aria-hidden="true"]').text());
      expect(wrapper.attributes('data-status')).toBe(status);
    }
    expect(texts.size).toBe(4);
    expect(glyphs.size).toBe(4);
  });

  it('translates', () => {
    const h = createHarness();
    h.i18n.global.locale.value = 'ru';
    const wrapper = mount(ConnectionStatus, {
      props: { status: 'stale' },
      global: h.global,
    });
    expect(wrapper.get('.conn__text').text()).toBe('Данные устарели');
  });
});

describe('QualityBadge', () => {
  it('shows the quality word with a per-state glyph', () => {
    const h = createHarness();
    const glyphs = new Set<string>();
    for (const quality of ['good', 'suspect', 'bad'] as const) {
      const wrapper = mount(QualityBadge, { props: { quality }, global: h.global });
      expect(wrapper.text()).toContain(
        quality === 'good' ? 'Good' : quality === 'suspect' ? 'Suspect' : 'Bad',
      );
      glyphs.add(wrapper.get('[aria-hidden="true"]').text());
      expect(wrapper.attributes('data-quality')).toBe(quality);
    }
    expect(glyphs.size).toBe(3);
  });
});
