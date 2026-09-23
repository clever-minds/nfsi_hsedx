<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue';

defineProps<{ label: string; value: string | number; hint?: string; accent?: boolean; icon?: string }>();
</script>

<template>
  <div class="card flex items-start gap-4 p-5 transition hover:shadow-md">
    <span
      class="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full"
      :class="accent ? 'bg-accent-500/10 text-accent-600' : 'bg-brand-50 text-brand-500'"
    >
      <Icon :name="icon ?? 'bar-chart'" :size="22" />
    </span>
    <div class="min-w-0 flex-1">
      <!-- The figure stays on one line: a wrapped currency amount reads as two
           numbers. It shrinks instead, so a long total stays legible. -->
      <div class="truncate text-2xl font-bold leading-tight text-slate-900" :title="String(value)">
        {{ value }}
      </div>
      <!-- The label wraps. Truncating it produced "Revenue T…", "Payout Qu…"
           across the whole admin dashboard, because four cards in a row leave
           roughly 150px of text width and these labels are full phrases.
           `capitalize` was also dropped: the translations are already cased
           correctly, and forcing title case mangles languages that have none. -->
      <div class="mt-0.5 text-sm leading-snug text-slate-500">{{ label }}</div>
      <div v-if="hint" class="mt-1 text-xs leading-snug text-slate-400">{{ hint }}</div>
    </div>
  </div>
</template>
