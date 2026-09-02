import { onMounted, onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * The rendered height of an element, kept current as it resizes.
 *
 * `ResizeObserver` where it exists; otherwise a single measurement on mount.
 * The fallback matters for tests, where the DOM shim has no layout and no
 * observer — a `fallback` lets a component test pin the viewport to a known
 * size and assert exactly how many rows that yields.
 */
export function useElementHeight(
  target: Ref<HTMLElement | null>,
  fallback = 0,
): Ref<number> {
  const height = ref(fallback);
  let observer: ResizeObserver | null = null;

  function measure(element: HTMLElement): void {
    const measured = element.clientHeight;
    if (measured > 0) height.value = measured;
  }

  function observe(element: HTMLElement | null): void {
    observer?.disconnect();
    observer = null;
    if (!element) return;
    measure(element);
    if (typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.height > 0) height.value = entry.contentRect.height;
    });
    observer.observe(element);
  }

  onMounted(() => {
    observe(target.value);
  });
  watch(target, observe);
  onScopeDispose(() => observer?.disconnect());

  return height;
}
