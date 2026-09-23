<script setup lang="ts" generic="T extends Record<string, unknown>">
import { useI18n } from 'vue-i18n';
import { fmtAngka } from '@/lib/format';

interface Column {
  key: string;
  label: string;
}
defineProps<{ columns: Column[]; rows: T[]; loading?: boolean; empty?: string }>();

const { t } = useI18n();
</script>

<template>
  <!-- Kartu tabel = satu panel utuh: toolbar, tabel, lalu footer paginasi.
       Filter tabel masuk lewat slot `toolbar`, bukan ditaruh view di luar
       kartu: kontrol yang mengambang di atas latar halaman tidak terbaca
       sebagai milik tabel yang diaturnya. -->
  <div class="card">
    <div v-if="$slots.toolbar" class="flex flex-wrap items-end gap-2 border-b border-slate-200 p-4">
      <slot name="toolbar" />
      <!-- Jumlah baris muncul otomatis, kecuali tabel ini berpaginasi — di sana
           angka totalnya sudah ada di footer dan akan jadi dua angka berbeda
           untuk hal yang sama (jumlah halaman ini vs jumlah seluruhnya). -->
      <span v-if="!$slots.footer && !loading && rows.length" class="table-count num ms-auto self-center">
        {{ t('common.table.count', { total: fmtAngka(rows.length) }) }}
      </span>
    </div>

    <!-- Scroll horizontal dibatasi ke pembungkus tabel saja. Kalau melekat di
         kartu, dropdown apa pun di toolbar akan ikut terpotong. -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th v-for="c in columns" :key="c.key" class="px-4 py-3 font-medium">{{ c.label }}</th>
            <th v-if="$slots.actions" class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="loading">
            <td :colspan="columns.length + 1" class="px-4 py-8 text-center text-slate-400">{{ t('common.state.loading') }}</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td :colspan="columns.length + 1" class="px-4 py-8 text-center text-slate-400">
              {{ empty || t('common.state.empty') }}
            </td>
          </tr>
          <tr v-for="(row, i) in rows" v-else :key="i" class="hover:bg-slate-50">
            <td v-for="c in columns" :key="c.key" class="px-4 py-3 text-slate-700">
              <slot :name="`cell:${c.key}`" :row="row" :value="row[c.key]">{{ row[c.key] }}</slot>
            </td>
            <td v-if="$slots.actions" class="px-4 py-3 text-end">
              <div class="flex items-center justify-end gap-1"><slot name="actions" :row="row" /></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="$slots.footer" class="border-t border-slate-200 p-4"><slot name="footer" /></div>
  </div>
</template>
