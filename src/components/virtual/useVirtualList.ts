import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { computeWindow, type VirtualWindow } from './virtualWindow';

export interface UseVirtualListOptions {
  count: MaybeRefOrGetter<number>;
  /** Every row is exactly this tall. That constraint is what makes the rest trivial. */
  itemHeight: MaybeRefOrGetter<number>;
  viewportHeight: MaybeRefOrGetter<number>;
  scrollTop: MaybeRefOrGetter<number>;
  /**
   * Rows rendered beyond each edge of the viewport.
   *
   * @defaultValue `4`
   */
  overscan?: MaybeRefOrGetter<number>;
}

export interface UseVirtualListReturn {
  window: ComputedRef<VirtualWindow>;
  /** `end - start`: how many rows are in the DOM. */
  rendered: ComputedRef<number>;
}

/**
 * Fixed-height windowing: given how tall the viewport is and how far it has
 * scrolled, which rows exist in the DOM.
 *
 * This is the minimum that demonstrates the principle — a scroll container
 * whose content is a spacer of the full height, and a translated block of the
 * few rows that are actually visible. It is deliberately not a general
 * virtualizer; see `docs/virtualization.md` for what that would add and when
 * to reach for a library instead.
 *
 * The window is a `computed`, so it recalculates only when an input changes.
 * The data behind the rows is not an input: a snapshot commit re-renders the
 * rows that are in the window, but does not recompute which ones they are.
 */
export function useVirtualList(options: UseVirtualListOptions): UseVirtualListReturn {
  const window = computed(() =>
    computeWindow(
      toValue(options.count),
      toValue(options.itemHeight),
      toValue(options.viewportHeight),
      toValue(options.scrollTop),
      toValue(options.overscan ?? 4),
    ),
  );
  const rendered = computed(() => window.value.end - window.value.start);
  return { window, rendered };
}
