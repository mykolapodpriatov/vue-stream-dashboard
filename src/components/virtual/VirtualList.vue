<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue';
import { useElementHeight } from './useElementHeight';
import { useVirtualList } from './useVirtualList';
import { scrollTopFor } from './virtualWindow';

/**
 * A fixed-row-height virtual list with grid semantics.
 *
 * The component owns everything that has to be right for a screen reader or a
 * keyboard: the `grid` role, `aria-rowcount` for the rows that are *not* in
 * the DOM, `aria-rowindex` on the ones that are, and a roving active row
 * driven by the arrow keys and announced through `aria-activedescendant`. The
 * consumer supplies cells through the `row` slot and, optionally, a header
 * row.
 *
 * One element is the grid, the scroll container and the focus target. That is
 * not a shortcut: `aria-activedescendant` has to sit on the focused element,
 * and the ARIA grid pattern puts focus on the grid. The header is `sticky`
 * inside it so it stays put without leaving the grid.
 *
 * Without the ARIA, a virtualized list reads as "list, 27 items" to someone
 * who cannot see that the scrollbar says ten thousand.
 */
const props = withDefaults(
  defineProps<{
    count: number;
    itemHeight: number;
    /** Accessible name for the grid. Required: an unnamed grid is a mystery. */
    label: string;
    overscan?: number;
    /**
     * Pin the container height instead of measuring it. For tests and for
     * layouts that already know the number.
     */
    viewportHeight?: number;
    /** Stable DOM id for a row, so `aria-activedescendant` can point at it. */
    rowId?: (index: number) => string;
  }>(),
  {
    overscan: 4,
    rowId: (index: number) => `virtual-row-${index}`,
  },
);

const emit = defineEmits<{
  /** Enter or Space on the active row, or a click on any row. */
  select: [index: number];
}>();

/** The row the keyboard is on. Not focus: the grid holds focus, and this is announced through it. */
const activeIndex = defineModel<number>('activeIndex', { default: 0 });

const slots = useSlots();
const grid = ref<HTMLElement | null>(null);
const header = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const measuredGrid = useElementHeight(grid, 0);
const headerHeight = useElementHeight(header, 0);
/** The part of the container rows can occupy: everything under the sticky header. */
const viewportHeight = computed(() =>
  Math.max(0, (props.viewportHeight ?? measuredGrid.value) - headerHeight.value),
);

const { window, rendered } = useVirtualList({
  count: () => props.count,
  itemHeight: () => props.itemHeight,
  viewportHeight,
  scrollTop,
  overscan: () => props.overscan,
});

const hasHeader = computed(() => Boolean(slots.header));
/** Data rows are numbered after the header row, if there is one. */
const rowOffset = computed(() => (hasHeader.value ? 2 : 1));

function onScroll(): void {
  if (grid.value) scrollTop.value = grid.value.scrollTop;
}

/** Bring a row into view with the smallest scroll that does it. */
function scrollToIndex(index: number): void {
  const element = grid.value;
  if (!element) return;
  const next = scrollTopFor(
    index,
    props.itemHeight,
    viewportHeight.value,
    element.scrollTop,
  );
  if (next !== element.scrollTop) {
    element.scrollTop = next;
    scrollTop.value = next;
  }
}

function moveActive(to: number): void {
  const clamped = Math.min(Math.max(0, to), props.count - 1);
  if (clamped < 0) return;
  activeIndex.value = clamped;
  scrollToIndex(clamped);
}

function onKeydown(event: KeyboardEvent): void {
  const page = Math.max(1, Math.floor(viewportHeight.value / props.itemHeight));
  switch (event.key) {
    case 'ArrowDown':
      moveActive(activeIndex.value + 1);
      break;
    case 'ArrowUp':
      moveActive(activeIndex.value - 1);
      break;
    case 'PageDown':
      moveActive(activeIndex.value + page);
      break;
    case 'PageUp':
      moveActive(activeIndex.value - page);
      break;
    case 'Home':
      moveActive(0);
      break;
    case 'End':
      moveActive(props.count - 1);
      break;
    case 'Enter':
    case ' ':
      emit('select', activeIndex.value);
      break;
    default:
      return;
  }
  event.preventDefault();
}

/**
 * Clicks are delegated from the grid rather than bound per row: rows are not
 * focusable (the grid is), so a per-row handler would be an interactive
 * element the keyboard cannot reach — and there would be up to eighty of them
 * to re-bind every frame.
 */
function onClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  const row = target?.closest<HTMLElement>('[data-index]');
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  activeIndex.value = index;
  emit('select', index);
}

// If the fleet shrinks under the active row, pull it back inside.
watch(
  () => props.count,
  (count) => {
    if (activeIndex.value >= count) activeIndex.value = Math.max(0, count - 1);
  },
);

defineExpose({ scrollToIndex, rendered });
</script>

<template>
  <div
    ref="grid"
    class="virtual-list"
    role="grid"
    tabindex="0"
    :aria-label="label"
    :aria-rowcount="count + (hasHeader ? 1 : 0)"
    :aria-activedescendant="count > 0 ? rowId(activeIndex) : undefined"
    :style="props.viewportHeight ? { height: `${props.viewportHeight}px` } : undefined"
    @scroll.passive="onScroll"
    @keydown="onKeydown"
    @click="onClick"
  >
    <div v-if="hasHeader" ref="header" class="virtual-list__header" role="rowgroup">
      <slot name="header" />
    </div>
    <div class="virtual-list__spacer" :style="{ height: `${window.totalHeight}px` }">
      <div
        class="virtual-list__rows"
        role="rowgroup"
        :style="{ transform: `translateY(${window.offsetTop}px)` }"
      >
        <div
          v-for="n in rendered"
          :id="rowId(window.start + n - 1)"
          :key="window.start + n - 1"
          class="virtual-list__row"
          role="row"
          :aria-rowindex="window.start + n - 1 + rowOffset"
          :aria-selected="window.start + n - 1 === activeIndex"
          :data-index="window.start + n - 1"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot
            name="row"
            :index="window.start + n - 1"
            :active="window.start + n - 1 === activeIndex"
          />
        </div>
      </div>
    </div>
    <p v-if="count === 0" class="virtual-list__empty">
      <slot name="empty">Nothing to show.</slot>
    </p>
  </div>
</template>

<style scoped>
.virtual-list {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  /* The grid is the focusable element; draw the ring inside so rows scrolling
     under the edge cannot clip it. */
  outline-offset: -2px;
}

.virtual-list__header {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}

.virtual-list__spacer {
  position: relative;
}

.virtual-list__rows {
  position: absolute;
  inset: 0 0 auto 0;
  will-change: transform;
}

.virtual-list__row {
  box-sizing: border-box;
  border-bottom: 1px solid var(--border);
}

.virtual-list__row[aria-selected='true'] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: inset 3px 0 0 var(--accent);
}

.virtual-list__empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-muted);
}
</style>
