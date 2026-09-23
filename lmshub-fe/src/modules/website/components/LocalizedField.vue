<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Localized, LocaleKey } from '@/lib/site-content';

/**
 * Satu field teks yang punya nilai per bahasa.
 *
 * Bahasa yang sedang disunting ditentukan dari luar (satu pemilih untuk seluruh
 * halaman) alih-alih tab per field: halaman Website punya puluhan field, dan
 * tab di masing-masingnya membuat admin harus mengulang klik yang sama berkali
 * -kali untuk menerjemahkan satu halaman.
 *
 * Placeholder diisi teks bawaan aplikasi, sehingga terlihat jelas apa yang akan
 * tampil bila field ini dibiarkan kosong.
 */
const props = withDefaults(
  defineProps<{
    modelValue: Localized;
    locale: LocaleKey;
    label: string;
    /** Teks yang dipakai halaman publik bila field ini kosong. */
    fallback?: string;
    hint?: string;
    multiline?: boolean;
    disabled?: boolean;
  }>(),
  { fallback: '', hint: '', multiline: false, disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [Localized] }>();
const { t } = useI18n();

const value = computed({
  get: () => props.modelValue?.[props.locale] ?? '',
  set: (v: string) => emit('update:modelValue', { ...(props.modelValue ?? {}), [props.locale]: v }),
});

/** Bahasa lain yang sudah terisi — penanda bahwa terjemahannya belum lengkap. */
const terisiLain = computed(() => {
  const all: LocaleKey[] = ['en', 'hi'];
  return all.filter((l) => l !== props.locale && (props.modelValue?.[l] ?? '').trim());
});
</script>

<template>
  <div>
    <label class="label flex items-center gap-2">
      {{ label }}
      <span
        v-if="terisiLain.length && !value"
        class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal uppercase text-slate-500"
      >
        {{ terisiLain.join(' · ') }}
      </span>
    </label>
    <p v-if="hint" class="mb-1.5 text-xs text-slate-400">{{ hint }}</p>
    <textarea
      v-if="multiline"
      v-model="value"
      rows="3"
      class="input"
      :placeholder="fallback || t('website.defaultPlaceholder')"
      :disabled="disabled"
      :dir="locale === 'ar' ? 'rtl' : 'ltr'"
    ></textarea>
    <input
      v-else
      v-model="value"
      class="input"
      :placeholder="fallback || t('website.defaultPlaceholder')"
      :disabled="disabled"
      :dir="locale === 'ar' ? 'rtl' : 'ltr'"
    />
  </div>
</template>
