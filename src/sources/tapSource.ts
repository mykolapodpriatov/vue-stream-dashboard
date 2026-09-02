import type { StreamSource } from './StreamSource';

/**
 * Observe a source's batches without changing them. The recorder sits here:
 * it sees exactly what the pipeline sees, including the dirt, and the pipeline
 * does not know it is being watched.
 */
export function tapSource<T>(
  inner: StreamSource<T>,
  observe: (batch: readonly T[]) => void,
): StreamSource<T> {
  return {
    async *connect() {
      for await (const batch of inner.connect()) {
        observe(batch);
        yield batch;
      }
    },
    close() {
      inner.close();
    },
  };
}
