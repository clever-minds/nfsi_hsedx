<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtAngka } from '@/lib/format';
import type { DonutSegment } from '@/lib/chart-palette';

/**
 * Donut bagian-terhadap-keseluruhan.
 *
 * Dipakai hanya untuk komposisi (satu total dipecah jadi beberapa bagian) dan
 * dibatasi enam segmen — di atas itu perbedaan sudut jadi tidak terbaca.
 *
 * Warna melekat pada segmen lewat `color` yang dikirim pemanggil, bukan pada
 * urutan tampil; jadi ketika suatu status naik-turun peringkat, warnanya tidak
 * ikut berpindah. Nama dan angka selalu tampil di legenda, sehingga identitas
 * tidak pernah bergantung pada warna saja.
 */
const props = withDefaults(
  defineProps<{
    segments: DonutSegment[];
    /** Teks kecil di tengah donut, di bawah angka total. */
    totalLabel: string;
    size?: number;
  }>(),
  { size: 168 },
);

/** Jarak antar segmen, dalam satuan keliling (keliling = 100). */
const GAP = 0.9;

const total = computed(() => props.segments.reduce((a, s) => a + s.value, 0));

/** Segmen bernilai nol dilewati: irisan 0° hanya menambah noise di legenda. */
const visible = computed(() => props.segments.filter((s) => s.value > 0));

const arcs = computed(() => {
  let cursor = 0;
  return visible.value.map((s) => {
    const pct = (s.value / total.value) * 100;
    const arc = { ...s, pct, len: Math.max(0.6, pct - GAP), offset: cursor };
    cursor += pct;
    return arc;
  });
});

const hovered = ref<string>('');
const active = computed(() => arcs.value.find((a) => a.key === hovered.value) ?? null);

const pct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;
</script>

<template>
  <div class="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
    <!-- Cincin -->
    <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg
        viewBox="0 0 42 42"
        class="h-full w-full -rotate-90"
        role="img"
        :aria-label="visible.map((s) => `${s.label}: ${fmtAngka(s.value)}`).join(', ')"
      >
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" stroke-width="5" />
        <circle
          v-for="a in arcs"
          :key="a.key"
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          :stroke="a.color"
          stroke-width="5"
          :stroke-dasharray="`${a.len} ${100 - a.len}`"
          :stroke-dashoffset="-a.offset"
          stroke-linecap="butt"
          class="cursor-default transition-opacity"
          :class="hovered && hovered !== a.key ? 'opacity-25' : 'opacity-100'"
          @mouseenter="hovered = a.key"
          @mouseleave="hovered = ''"
        />
      </svg>
      <!-- Angka di tengah: total, atau segmen yang sedang disorot -->
      <div class="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div class="num text-2xl font-semibold text-slate-900">
            {{ fmtAngka(active ? active.value : total) }}
          </div>
          <div class="mt-0.5 max-w-[7rem] text-[11px] leading-tight text-slate-400">
            {{ active ? active.label : totalLabel }}
          </div>
        </div>
      </div>
    </div>

    <!-- Legenda: nama + jumlah + persentase, jadi warna bukan satu-satunya penanda -->
    <ul class="w-full min-w-0 flex-1 space-y-2">
      <li
        v-for="a in arcs"
        :key="a.key"
        class="flex items-center gap-2.5 rounded px-1 py-0.5 transition"
        :class="hovered === a.key ? 'bg-slate-50' : ''"
        @mouseenter="hovered = a.key"
        @mouseleave="hovered = ''"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: a.color }" aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate text-sm text-slate-600">{{ a.label }}</span>
        <span class="num shrink-0 text-sm font-medium text-slate-800">{{ fmtAngka(a.value) }}</span>
        <span class="num w-11 shrink-0 text-end text-xs text-slate-400">{{ pct(a.pct) }}</span>
      </li>
    </ul>
  </div>
</template>
