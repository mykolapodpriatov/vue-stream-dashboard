<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const { t } = useI18n();
</script>

<template>
  <section>
    <h1>{{ t('notFound.title') }}</h1>
    <p>
      {{ t('notFound.body') }}
      <RouterLink to="/">{{ t('instrument.back') }}</RouterLink>
    </p>
  </section>
</template>
