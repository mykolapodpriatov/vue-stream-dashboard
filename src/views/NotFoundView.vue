<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section>
    <h1>Page not found</h1>
    <p>
      Nothing lives at this address.
      <RouterLink to="/">Back to the live feed</RouterLink>
    </p>
  </section>
</template>
