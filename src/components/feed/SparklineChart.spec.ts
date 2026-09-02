import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SparklineChart from './SparklineChart.vue';

function fakeContext() {
  return {
    calls: [] as string[],
    setTransform() {
      this.calls.push('setTransform');
    },
    clearRect() {
      this.calls.push('clearRect');
    },
    beginPath() {
      this.calls.push('beginPath');
    },
    moveTo() {
      this.calls.push('moveTo');
    },
    lineTo() {
      this.calls.push('lineTo');
    },
    stroke() {
      this.calls.push('stroke');
    },
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
  };
}

describe('SparklineChart', () => {
  it('is an image with the label it was given', () => {
    const wrapper = mount(SparklineChart, {
      props: { points: [], label: 'Empty chart' },
    });
    const canvas = wrapper.get('canvas');
    expect(canvas.attributes('role')).toBe('img');
    expect(canvas.attributes('aria-label')).toBe('Empty chart');
  });

  it('draws a baseline and one polyline through the points', async () => {
    const context = fakeContext();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const wrapper = mount(SparklineChart, {
      props: {
        points: [
          { ts: 1, value: 10 },
          { ts: 2, value: 12 },
          { ts: 3, value: 11 },
        ],
        label: 'Three points',
      },
    });
    await nextTick();
    expect(context.calls.filter((c) => c === 'stroke')).toHaveLength(2);
    expect(context.calls.filter((c) => c === 'lineTo')).toHaveLength(1 + 2);
    getContext.mockRestore();
    wrapper.unmount();
  });

  it('draws nothing but the clear for fewer than two points', async () => {
    const context = fakeContext();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    mount(SparklineChart, { props: { points: [{ ts: 1, value: 1 }], label: 'One' } });
    await nextTick();
    expect(context.calls).toContain('clearRect');
    expect(context.calls).not.toContain('stroke');
    getContext.mockRestore();
  });

  it('redraws when the points change', async () => {
    const context = fakeContext();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const wrapper = mount(SparklineChart, { props: { points: [], label: 'Growing' } });
    const before = context.calls.length;
    await wrapper.setProps({
      points: [
        { ts: 1, value: 5 },
        { ts: 2, value: 5 },
      ],
    });
    await nextTick();
    expect(context.calls.length).toBeGreaterThan(before);
    // A flat line still strokes: the band is widened rather than collapsed.
    expect(context.calls.filter((c) => c === 'stroke')).toHaveLength(2);
    getContext.mockRestore();
  });

  it('survives a canvas without a 2D context', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    expect(() =>
      mount(SparklineChart, {
        props: {
          points: [
            { ts: 1, value: 1 },
            { ts: 2, value: 2 },
          ],
          label: 'No context',
        },
      }),
    ).not.toThrow();
    getContext.mockRestore();
  });
});
