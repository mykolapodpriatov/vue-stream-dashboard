<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConnectionStatus from '@/components/feed/ConnectionStatus.vue';
import type { Fault } from '@/sources/liveWorkerCore';
import { useAnnouncerStore } from '@/stores/announcer';
import { useFeedStore } from '@/stores/feed';

const feed = useFeedStore();
const announcer = useAnnouncerStore();
const { t, n } = useI18n();

// A one-second clock for "last data N s ago". Its own interval rather than a
// per-frame value: the number changes once a second, and re-rendering this
// page sixty times a second to show it would be the anti-pattern in miniature.
const now = ref(performance.now());
const clock = setInterval(() => {
  now.value = performance.now();
}, 1000);
onScopeDispose(() => {
  clearInterval(clock);
});

const secondsSinceData = computed(() =>
  feed.lastDataAt === null
    ? null
    : Math.max(0, Math.round((now.value - feed.lastDataAt) / 1000)),
);

const isLive = computed(() => feed.mode === 'live');
const fault = ref<Fault>('none');

function inject(next: Fault): void {
  fault.value = next;
  feed.injectFault(next);
}

function reconnect(): void {
  fault.value = 'none';
  feed.start();
}

function toggleRecording(): void {
  if (feed.isRecording) {
    const captured = feed.stopRecording();
    feed.downloadRecording(captured);
    void announcer.announce(
      t('connection.recordingFrames', { count: captured.frames.length }),
    );
  } else {
    feed.startRecording();
  }
}

const loadError = ref<string | null>(null);
const loadedMessage = ref<string | null>(null);

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loadError.value = null;
  loadedMessage.value = null;
  try {
    const recording = await feed.loadRecording(file);
    loadedMessage.value = t('connection.loaded', {
      count: n(recording.frames.length, 'integer'),
      name: file.name,
    });
    void announcer.announce(loadedMessage.value);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    loadError.value = t('connection.loadError', { message });
  } finally {
    input.value = '';
  }
}

const normalizerKeys = [
  'accepted',
  'malformed',
  'duplicate',
  'stale',
  'reordered',
  'gaps',
  'unknownInstrument',
] as const;
</script>

<template>
  <section class="connection">
    <h1>{{ t('connection.title') }}</h1>

    <div class="connection__status">
      <ConnectionStatus :status="feed.status" />
      <dl class="connection__facts">
        <div>
          <dt>{{ t('connection.transport') }}</dt>
          <dd>{{ t(`connection.transports.${feed.transport}`) }}</dd>
        </div>
        <div>
          <dt>{{ t('connection.mode') }}</dt>
          <dd>{{ t(`playback.${feed.mode}`) }}</dd>
        </div>
        <div>
          <dt>{{ t('connection.lastMessage') }}</dt>
          <dd>
            {{
              secondsSinceData === null
                ? t('connection.never')
                : t('connection.ago', { seconds: secondsSinceData })
            }}
          </dd>
        </div>
      </dl>
    </div>

    <section class="connection__panel">
      <h2>{{ t('connection.faults') }}</h2>
      <p class="connection__help">{{ t('connection.faultsHelp') }}</p>
      <div class="connection__actions" role="group" :aria-label="t('connection.faults')">
        <button
          type="button"
          :disabled="!isLive"
          :aria-pressed="fault === 'stall'"
          data-fault="stall"
          @click="inject('stall')"
        >
          {{ t('connection.stall') }}
        </button>
        <button
          type="button"
          :disabled="!isLive"
          data-fault="drop"
          @click="inject('drop')"
        >
          {{ t('connection.drop') }}
        </button>
        <button
          type="button"
          :disabled="!isLive || fault === 'none'"
          data-fault="none"
          @click="inject('none')"
        >
          {{ t('connection.clear') }}
        </button>
        <button type="button" data-action="reconnect" @click="reconnect">
          {{ t('connection.reconnect') }}
        </button>
      </div>
    </section>

    <section class="connection__panel">
      <h2>{{ t('connection.recording') }}</h2>
      <p class="connection__help">{{ t('connection.recordingHelp') }}</p>
      <div class="connection__actions">
        <button
          type="button"
          data-action="record"
          :aria-pressed="feed.isRecording"
          @click="toggleRecording"
        >
          {{
            feed.isRecording
              ? t('connection.stopRecording')
              : t('connection.startRecording')
          }}
        </button>
        <span v-if="feed.isRecording || feed.recordedCount > 0" class="connection__muted">
          {{
            t('connection.recordingFrames', { count: n(feed.recordedCount, 'integer') })
          }}
        </span>
      </div>

      <div class="connection__file">
        <label for="recording-file">{{ t('connection.load') }}</label>
        <input
          id="recording-file"
          type="file"
          accept="application/json,.json"
          aria-describedby="recording-file-help"
          @change="onFile"
        />
        <span id="recording-file-help" class="connection__help">
          {{ t('connection.loadHelp') }}
        </span>
      </div>
      <p v-if="loadError" class="connection__error" role="alert">{{ loadError }}</p>
      <p v-else-if="loadedMessage" class="connection__muted">{{ loadedMessage }}</p>
    </section>

    <section class="connection__panel">
      <h2>{{ t('connection.normalizer') }}</h2>
      <dl class="connection__facts">
        <div v-for="key in normalizerKeys" :key="key" :data-stat="key">
          <dt>{{ t(`connection.${key}`) }}</dt>
          <dd>{{ n(feed.stats[key], 'integer') }}</dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.connection {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 48rem;
}

.connection__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
}

.connection__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-8);
  margin: 0;
}

.connection__facts dt {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.connection__facts dd {
  margin: 0;
  font-family: var(--font-mono);
}

.connection__panel {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.connection__panel h2 {
  font-size: 1.1rem;
}

.connection__help {
  margin: 0 0 var(--space-3);
  font-size: 0.9rem;
  color: var(--text-muted);
}

.connection__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.connection__actions button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
}

.connection__actions button[aria-pressed='true'] {
  background: var(--surface-raised);
  font-weight: 600;
}

.connection__actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connection__file {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.connection__muted {
  color: var(--text-muted);
}

.connection__error {
  color: var(--status-bad);
}
</style>
