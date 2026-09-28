<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-medium text-slate-900 sm:text-2xl">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-slate-400">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-2"><slot name="actions" /></div>
  </div>
</template>
