<script setup lang="ts">
import { computed } from 'vue';
import { statusLabel } from '@/lib/labels';

const props = defineProps<{ status: string }>();

// Warna ditentukan dari kode mentah BE (selalu Indonesia), bukan dari teks
// yang sudah diterjemahkan — jadi tetap akurat di semua bahasa.
const tone = computed(() => {
  const s = props.status.toLowerCase();
  if (/(aktif|terbit|lunas|selesai|disetujui|diterima|hadir|active)/.test(s)) return 'bg-emerald-100 text-emerald-700';
  if (/(pending|menunggu|dalam_review|proses|dp|prospek|terlambat)/.test(s)) return 'bg-amber-100 text-amber-700';
  if (/(batal|ditolak|absen|kedaluwarsa|nonaktif|inactive|dibatalkan)/.test(s)) return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
});

const label = computed(() => statusLabel(props.status));
</script>

<template>
  <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium" :class="tone">{{ label }}</span>
</template>
