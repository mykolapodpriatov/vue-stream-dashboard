import { defineStore } from 'pinia';
import { nextTick, ref } from 'vue';

/**
 * One polite live region for the whole app.
 *
 * Connection changes, a finished recording, a loaded file — anything a
 * sighted user notices peripherally needs a route to a screen reader. A single
 * `aria-live` region in the shell, fed from here, is that route; scattering
 * live regions across components makes them talk over each other.
 */
export const useAnnouncerStore = defineStore('announcer', () => {
  const message = ref('');

  async function announce(text: string): Promise<void> {
    // Clear first so repeating the same text is announced again: live regions
    // only speak on change.
    message.value = '';
    await nextTick();
    message.value = text;
  }

  return { message, announce };
});
