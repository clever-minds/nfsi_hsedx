<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * Rating bintang. Mode baca (default) menampilkan bintang terisi sesuai `modelValue`
 * (mendukung pecahan). Mode `editable` memungkinkan klik untuk memilih 1–5.
 */
const props = withDefaults(
  defineProps<{ modelValue?: number; size?: number; editable?: boolean }>(),
  { modelValue: 0, size: 18, editable: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const hover = ref(0);
const shown = computed(() => (props.editable && hover.value ? hover.value : props.modelValue));

function pct(i: number): number {
  // Persentase isian bintang ke-i (1..5) untuk dukungan pecahan.
  const v = shown.value - (i - 1);
  return Math.max(0, Math.min(1, v)) * 100;
}
function pick(i: number) {
  if (props.editable) emit('update:modelValue', i);
}
</script>

<template>
  <div class="inline-flex items-center gap-0.5" :class="editable ? 'cursor-pointer' : ''">
    <span
      v-for="i in 5"
      :key="i"
      class="relative inline-block leading-none"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @mouseenter="editable && (hover = i)"
      @mouseleave="editable && (hover = 0)"
      @click="pick(i)"
    >
      <!-- Bintang kosong (latar) -->
      <svg :width="size" :height="size" viewBox="0 0 24 24" class="absolute inset-0 text-slate-300" fill="currentColor">
        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 7.1-1.01L12 2z" />
      </svg>
      <!-- Bintang terisi (di-clip sesuai pct) -->
      <span class="absolute inset-0 overflow-hidden text-accent-500" :style="{ width: `${pct(i)}%` }">
        <svg :width="size" :height="size" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 7.1-1.01L12 2z" />
        </svg>
      </span>
    </span>
  </div>
</template>
