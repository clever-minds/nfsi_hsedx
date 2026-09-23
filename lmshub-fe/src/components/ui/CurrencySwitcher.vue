<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCurrencyStore } from '@/stores/currency';
import Icon from '@/components/ui/Icon.vue';

/**
 * Pemilih mata uang tampilan, dipasang bersebelahan dengan pemilih bahasa.
 *
 * Menggambar dirinya hanya bila memang ada pilihan: sakelar di Pengaturan
 * menyala DAN tersedia lebih dari satu mata uang aktif. Dropdown berisi satu
 * opsi adalah kontrol yang menjanjikan sesuatu lalu tidak menepatinya.
 *
 * Harga yang ditampilkan dikonversi; penagihan tetap dalam mata uang basis —
 * itu dinyatakan di daftar, bukan disembunyikan.
 */
const props = withDefaults(
  defineProps<{ variant?: 'light' | 'dark'; showLabel?: boolean }>(),
  { variant: 'light', showLabel: true },
);

const store = useCurrencyStore();
const { t } = useI18n();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const label = computed(() => store.active.kode);

function pick(code: string) {
  store.setChoice(code);
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));
</script>

<template>
  <div v-if="store.canSwitch" ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition"
      :class="
        props.variant === 'dark'
          ? 'text-slate-300 hover:text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-brand-500'
      "
      :aria-label="t('common.currency.label') + ': ' + label"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="shrink-0 font-semibold leading-none">{{ store.active.simbol || '¤' }}</span>
      <span v-if="props.showLabel" class="hidden font-medium sm:inline">{{ label }}</span>
      <Icon name="chevron-down" :size="13" class="shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-75"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        class="absolute end-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      >
        <!-- Mengikuti bahasa antarmuka; itu yang diharapkan kebanyakan pengunjung. -->
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition hover:bg-brand-50"
          :class="store.choice === 'auto' ? 'font-medium text-brand-500' : 'text-slate-600'"
          @click="pick('auto')"
        >
          <Icon name="globe" :size="15" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ t('common.currency.followLanguage') }}</span>
          <Icon v-if="store.choice === 'auto'" name="check" :size="15" class="shrink-0" />
        </button>

        <div class="my-1 border-t border-slate-100"></div>

        <button
          v-for="c in store.list"
          :key="c.kode"
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition hover:bg-brand-50"
          :class="store.choice === c.kode ? 'font-medium text-brand-500' : 'text-slate-600'"
          @click="pick(c.kode)"
        >
          <span class="w-5 shrink-0 text-center font-semibold leading-none">{{ c.simbol || '¤' }}</span>
          <span class="min-w-0 flex-1 truncate">{{ c.kode }}</span>
          <Icon v-if="store.choice === c.kode" name="check" :size="15" class="shrink-0" />
        </button>

        <p class="border-t border-slate-100 px-3 py-2 text-[11px] leading-snug text-slate-400">
          {{ t('common.currency.billedIn', { code: store.base }) }}
        </p>
      </div>
    </Transition>
  </div>
</template>
