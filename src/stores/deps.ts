import type { InjectionKey } from 'vue';
import type { FrameScheduler } from '@/pipeline/frameScheduler';
import type { WorkerLike } from '@/sources/LiveSource';

/**
 * The seams the feed store lets a test control: how the worker is made, when
 * frames happen, and what time it is. Provided at the app level; absent in
 * production, where the real ones are used.
 *
 * Injection rather than module-level mutable state, because a Pinia store is a
 * singleton per app and a test that swaps a global would leak into the next.
 */
export interface FeedDeps {
  createWorker?: () => WorkerLike;
  scheduler?: FrameScheduler;
  now?: () => number;
}

export const FEED_DEPS: InjectionKey<FeedDeps> = Symbol('feed-deps');
