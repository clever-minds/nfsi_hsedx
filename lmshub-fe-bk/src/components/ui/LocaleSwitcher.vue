<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useLocale } from '@/composables/useLocale';
import Icon from '@/components/ui/Icon.vue';
import type { SupportedLocale } from '@/i18n';

/**
 * Pemilih bahasa. `variant` menyesuaikan warna agar cocok dipakai di
 * topbar gelap (dark), header putih (light), maupun daftar penuh (block).
 */
const props = withDefaults(
  defineProps<{ variant?: 'light' | 'dark' | 'block'; showLabel?: boolean }>(),
  { variant: 'light', showLabel: true },
);

const { locale, currentDef, locales, setLocale } = useLocale();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function pick(code: SupportedLocale) {
  setLocale(code);
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));
</script>

<template>
  <!-- Varian block: dipakai di halaman Pengaturan, semua bahasa terlihat. -->
  <div v-if="props.variant === 'block'" class="grid gap-2 sm:grid-cols-2">
    <button
      v-for="l in locales"
      :key="l.code"
      type="button"
      class="flex items-center gap-3 rounded border px-3 py-2.5 text-start text-sm transition"
      :class="
        l.code === locale
          ? 'border-brand-500 bg-brand-50 text-brand-600'
          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
      "
      @click="pick(l.code)"
    >
      <span class="text-lg leading-none">{{ l.flag }}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-medium">{{ l.native }}</span>
        <span class="block truncate text-xs text-slate-400">{{ l.english }}</span>
      </span>
      <Icon v-if="l.code === locale" name="check" :size="16" class="shrink-0" />
    </button>
  </div>

  <!-- Varian dropdown untuk header/topbar. -->
  <div v-else ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition"
      :class="
        props.variant === 'dark'
          ? 'text-slate-300 hover:text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-brand-500'
      "
      :aria-label="`Language: ${currentDef.english}`"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="globe" :size="props.variant === 'dark' ? 13 : 17" class="shrink-0" />
      <span v-if="props.showLabel" class="hidden font-medium sm:inline">{{ currentDef.code.toUpperCase() }}</span>
      <Icon
        name="chevron-down"
        :size="13"
        class="shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-75"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        class="absolute end-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      >
        <button
          v-for="l in locales"
          :key="l.code"
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition hover:bg-brand-50"
          :class="l.code === locale ? 'font-medium text-brand-500' : 'text-slate-600'"
          @click="pick(l.code)"
        >
          <span class="text-base leading-none">{{ l.flag }}</span>
          <span class="min-w-0 flex-1 truncate">{{ l.native }}</span>
          <Icon v-if="l.code === locale" name="check" :size="15" class="shrink-0" />
        </button>
      </div>
    </Transition>
  </div>
</template>
