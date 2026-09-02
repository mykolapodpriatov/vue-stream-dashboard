import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useVirtualList } from './useVirtualList';

describe('useVirtualList', () => {
  it('recomputes the window when the scroll position changes', () => {
    const scrollTop = ref(0);
    const { window, rendered } = useVirtualList({
      count: 10_000,
      itemHeight: 32,
      viewportHeight: 600,
      scrollTop,
    });
    expect(window.value.start).toBe(0);
    expect(rendered.value).toBe(23);

    scrollTop.value = 3_200;
    expect(window.value.start).toBe(96);
    expect(window.value.offsetTop).toBe(96 * 32);
  });

  it('recomputes when the count shrinks under the window', () => {
    const count = ref(10_000);
    const scrollTop = ref(319_400);
    const { window } = useVirtualList({
      count,
      itemHeight: 32,
      viewportHeight: 600,
      scrollTop,
    });
    expect(window.value.end).toBe(10_000);

    count.value = 50;
    expect(window.value.end).toBe(50);
    expect(window.value.start).toBe(50 - 19 - 4);
  });

  it('accepts getters for every input', () => {
    let height = 320;
    const { rendered } = useVirtualList({
      count: () => 100,
      itemHeight: () => 32,
      viewportHeight: () => height,
      scrollTop: () => 0,
      overscan: () => 0,
    });
    expect(rendered.value).toBe(10);
    height = 640;
    // A plain getter is not reactive — the test documents that callers pass
    // refs or reactive getters for anything that changes.
    expect(rendered.value).toBe(10);
  });
});
