<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtAngka } from '@/lib/format';

/**
 * Kontrol paginasi tunggal untuk footer DataTable. Dipakai bersama supaya
 * ukuran tombol dan format keterangan halaman sama di seluruh aplikasi.
 */
const props = defineProps<{ page: number; limit: number; total: number }>();
const emit = defineEmits<{ 'update:page': [number] }>();

const { t } = useI18n();
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
    <span class="num">
      {{ t('common.table.pageInfo', { page: fmtAngka(page), pages: fmtAngka(totalPages), total: fmtAngka(total) }) }}
    </span>
    <div class="flex gap-2">
      <button class="btn-outline btn-sm" :disabled="page <= 1" @click="emit('update:page', page - 1)">
        {{ t('common.action.previous') }}
      </button>
      <button class="btn-outline btn-sm" :disabled="page >= totalPages" @click="emit('update:page', page + 1)">
        {{ t('common.action.next') }}
      </button>
    </div>
  </div>
</template>
