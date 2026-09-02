<script setup lang="ts">
import { onMounted, onScopeDispose, ref, watch } from 'vue';
import type { HistoryPoint } from '@/composables/useInstrumentHistory';

/**
 * A canvas line chart with no library behind it.
 *
 * Canvas rather than SVG for the same reason the table is virtualized: the
 * DOM should not grow with the data. Three hundred `<path>` segments updated
 * sixty times a second is exactly the pattern this repository exists to
 * avoid; one `fillRect` and one `stroke` per frame is not.
 *
 * The chart is an image to assistive technology, and `label` is its
 * description — the consumer builds it from the same points, so it says what
 * the picture shows.
 */
const props = defineProps<{ points: readonly HistoryPoint[]; label: string }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let observer: ResizeObserver | null = null;

function draw(): void {
  const element = canvas.value;
  if (!element) return;
  const context = element.getContext('2d');
  if (!context) return;

  const ratio = window.devicePixelRatio || 1;
  const width = element.clientWidth || 300;
  const height = element.clientHeight || 120;
  if (element.width !== width * ratio || element.height !== height * ratio) {
    element.width = width * ratio;
    element.height = height * ratio;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const points = props.points;
  if (points.length < 2) return;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  // A flat line still needs a visible band to sit in.
  if (max - min < Number.EPSILON) {
    min -= 1;
    max += 1;
  }

  const padding = 6;
  const stepX = (width - padding * 2) / (points.length - 1);
  const scaleY = (height - padding * 2) / (max - min);
  const styles = getComputedStyle(element);
  const stroke = styles.getPropertyValue('--accent').trim() || '#1f5fbf';
  const grid = styles.getPropertyValue('--border').trim() || '#d5d9e0';

  context.strokeStyle = grid;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding, height / 2);
  context.lineTo(width - padding, height / 2);
  context.stroke();

  context.strokeStyle = stroke;
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  context.beginPath();
  points.forEach((point, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (point.value - min) * scaleY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

onMounted(() => {
  draw();
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    observer = new ResizeObserver(draw);
    observer.observe(canvas.value);
  }
});

// `flush: 'post'`: draw after Vue has committed the DOM for this frame, so
// the canvas has its final size and the render and the draw share a paint.
watch(() => props.points, draw, { flush: 'post' });

onScopeDispose(() => observer?.disconnect());
</script>

<template>
  <canvas ref="canvas" class="sparkline" role="img" :aria-label="label"></canvas>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 100%;
  height: 160px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
</style>
