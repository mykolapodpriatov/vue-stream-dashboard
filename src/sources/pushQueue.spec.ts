import { describe, expect, it } from 'vitest';
import { createPushQueue } from './pushQueue';

async function collect<T>(iterable: AsyncIterable<T>, limit = Infinity): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) {
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

describe('createPushQueue', () => {
  it('delivers pushed items in order and completes on end()', async () => {
    const queue = createPushQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    queue.end();
    expect(await collect(queue)).toEqual([1, 2, 3]);
  });

  it('hands an item straight to a waiting consumer', async () => {
    const queue = createPushQueue<string>();
    const iterator = queue[Symbol.asyncIterator]();
    const pending = iterator.next();
    queue.push('late');
    expect(await pending).toEqual({ value: 'late', done: false });
    expect(queue.size).toBe(0);
  });

  it('drops the oldest items past capacity and counts them', async () => {
    const queue = createPushQueue<number>({ capacity: 3 });
    for (const n of [1, 2, 3, 4, 5]) queue.push(n);
    expect(queue.dropped).toBe(2);
    queue.end();
    expect(await collect(queue)).toEqual([3, 4, 5]);
  });

  it('resolves a waiting consumer with done when ended while empty', async () => {
    const queue = createPushQueue<number>();
    const iterator = queue[Symbol.asyncIterator]();
    const pending = iterator.next();
    queue.end();
    expect(await pending).toEqual({ value: undefined, done: true });
  });

  it('ignores pushes after end()', async () => {
    const queue = createPushQueue<number>();
    queue.push(1);
    queue.end();
    queue.push(2);
    expect(await collect(queue)).toEqual([1]);
  });

  it('breaking out of the loop discards the backlog and ends the queue', async () => {
    const queue = createPushQueue<number>();
    for (const n of [1, 2, 3, 4]) queue.push(n);
    expect(await collect(queue, 2)).toEqual([1, 2]);
    expect(queue.ended).toBe(true);
    expect(queue.size).toBe(0);
  });
});
