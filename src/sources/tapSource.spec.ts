import { describe, expect, it } from 'vitest';
import type { StreamSource } from './StreamSource';
import { tapSource } from './tapSource';

function arraySource(batches: number[][]) {
  let closed = 0;
  const source: StreamSource<number> & { readonly closed: number } = {
    get closed() {
      return closed;
    },
    async *connect() {
      for (const batch of batches) {
        await Promise.resolve();
        yield batch;
      }
    },
    close() {
      closed += 1;
    },
  };
  return source;
}

describe('tapSource', () => {
  it('observes every batch and forwards it unchanged', async () => {
    const seen: number[][] = [];
    const source = tapSource(arraySource([[1, 2], [3]]), (batch) =>
      seen.push([...batch]),
    );
    const forwarded: (readonly number[])[] = [];
    for await (const batch of source.connect()) forwarded.push(batch);
    expect(seen).toEqual([[1, 2], [3]]);
    expect(forwarded).toEqual([[1, 2], [3]]);
  });

  it('closes the inner source', () => {
    const inner = arraySource([]);
    tapSource(inner, () => {}).close();
    expect(inner.closed).toBe(1);
  });
});
