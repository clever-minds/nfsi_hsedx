<script setup lang="ts">
import { computed } from 'vue';
import { useAppConfigStore } from '@/stores/appConfig';
import Icon from '@/components/ui/Icon.vue';

/**
 * Logo + nama aplikasi. Bila admin sudah mengunggah logo, gambar itu yang
 * dipakai; kalau belum, jatuh ke lambang bawaan + nama aplikasi sebagai teks,
 * sehingga instalasi baru tetap terlihat utuh tanpa mengunggah apa pun.
 */
const props = withDefaults(
  defineProps<{
    /** `dark` dipakai di atas latar gelap (footer publik). */
    tone?: 'light' | 'dark';
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { tone: 'light', size: 'md' },
);

const appConfig = useAppConfigStore();

const markSize = computed(() => ({ sm: 'h-9 w-9', md: 'h-9 w-9', lg: 'h-10 w-10' })[props.size]);
const iconSize = computed(() => ({ sm: 18, md: 20, lg: 22 })[props.size]);
const textSize = computed(() => ({ sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' })[props.size]);
const logoHeight = computed(() => ({ sm: 'max-h-8', md: 'max-h-9', lg: 'max-h-10' })[props.size]);
</script>

<template>
  <span class="flex shrink-0 items-center gap-2">
    <img
      v-if="appConfig.logoUrl"
      :src="appConfig.logoUrl"
      :alt="appConfig.appName"
      class="w-auto max-w-[11rem] object-contain"
      :class="logoHeight"
    />
    <template v-else>
      <span class="grid place-items-center rounded-full bg-brand-500 text-white" :class="markSize">
        <Icon name="play-circle" :size="iconSize" />
      </span>
      <span
        class="font-bold tracking-tight"
        :class="[textSize, props.tone === 'dark' ? 'text-white' : 'text-slate-900']"
      >
        {{ appConfig.appName }}
      </span>
    </template>
  </span>
</template>
