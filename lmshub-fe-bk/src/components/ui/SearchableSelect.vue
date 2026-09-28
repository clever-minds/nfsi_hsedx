<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '@/components/ui/Icon.vue';

/**
 * Dropdown dengan kotak cari.
 *
 * `<select>` biasa memaksa menggulir daftar panjang untuk menemukan satu baris,
 * dan tidak menunjukkan apa pun tentang pilihan yang sedang aktif sampai dibuka.
 * Di sini pilihan yang tersedia disaring saat mengetik, dan yang aktif ditandai.
 */

export interface Option {
  value: string;
  label: string;
  /** Baris kedua opsional — dipakai untuk keterangan seperti kurs. */
  hint?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: Option[];
    disabled?: boolean;
    placeholder?: string;
    /** Ditampilkan saat daftar kosong; biasanya mengarahkan ke tempat menambahnya. */
    emptyHint?: string;
  }>(),
  { disabled: false, placeholder: '', emptyHint: '' },
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const { t } = useI18n();
const open = ref(false);
const term = ref('');
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

const selected = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null);

const filtered = computed(() => {
  const q = term.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((o) => `${o.value} ${o.label}`.toLowerCase().includes(q));
});

function pick(value: string) {
  emit('update:modelValue', value);
  open.value = false;
}

async function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    term.value = '';
    await nextTick();
    search.value?.focus();
  }
}

function onClickOutside(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

// Esc menutup tanpa mengubah pilihan — kebiasaan yang orang harapkan dari
// kontrol semacam ini, dan murah untuk dipenuhi.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}

watch(() => props.disabled, (d) => { if (d) open.value = false; });

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="relative min-w-0 flex-1">
    <button
      type="button"
      class="input flex w-full items-center gap-2 text-start"
      :class="disabled ? 'cursor-not-allowed opacity-60' : ''"
      :disabled="disabled"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="min-w-0 flex-1 truncate" :class="selected ? 'text-slate-900' : 'text-slate-400'">
        {{ selected?.label || placeholder || t('common.action.choose') }}
      </span>
      <Icon name="chevron-down" :size="15" class="shrink-0 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-75"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        class="absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
      >
        <div class="border-b border-slate-100 p-2">
          <input
            ref="search"
            v-model="term"
            type="text"
            class="input py-1.5 text-sm"
            :placeholder="t('common.action.search')"
          />
        </div>

        <div class="max-h-64 overflow-y-auto py-1">
          <p v-if="!options.length" class="px-3 py-3 text-xs leading-snug text-slate-400">
            {{ emptyHint || t('common.state.empty') }}
          </p>
          <p v-else-if="!filtered.length" class="px-3 py-3 text-xs text-slate-400">
            {{ t('common.state.noResults') }}
          </p>

          <button
            v-for="o in filtered"
            :key="o.value"
            type="button"
            class="flex w-full items-start gap-2 px-3 py-2 text-start text-sm transition hover:bg-brand-50"
            :class="o.value === modelValue ? 'font-medium text-brand-500' : 'text-slate-600'"
            @click="pick(o.value)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ o.label }}</span>
              <span v-if="o.hint" class="block truncate text-xs text-slate-400">{{ o.hint }}</span>
            </span>
            <Icon v-if="o.value === modelValue" name="check" :size="15" class="mt-0.5 shrink-0" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
