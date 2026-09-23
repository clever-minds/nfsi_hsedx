<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtRelatif } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';

interface Notification {
  id: string;
  tipe: string;
  judul: string;
  isi?: string;
  tautan?: string;
  dibaca: boolean;
  dibuat_at: string;
}

const { t } = useI18n();

const notifications = ref<Notification[]>([]);
const loading = ref(true);
const error = ref('');
const filterBaca = ref<'' | 'true' | 'false'>('');

const unreadCount = computed(() => notifications.value.filter((n) => !n.dibaca).length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE membaca query filter[status] dengan nilai 'dibaca' | 'belum_dibaca' (bukan read=true/false)
    const status = filterBaca.value === 'true' ? 'dibaca' : filterBaca.value === 'false' ? 'belum_dibaca' : undefined;
    const res = await apiGetFull<Notification[]>('/notifications', { 'filter[status]': status });
    notifications.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('notifications.center.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function markRead(n: Notification) {
  if (n.dibaca) return;
  n.dibaca = true; // optimistic
  try {
    // BE: POST /notifications/:id/read (bukan PATCH)
    await apiPost(`/notifications/${n.id}/read`);
  } catch (e) {
    n.dibaca = false; // rollback
    error.value = errorMessage(e, t('notifications.center.markFailed'));
  }
}

async function markAllRead() {
  const unread = notifications.value.filter((n) => !n.dibaca);
  for (const n of unread) {
    n.dibaca = true;
  }
  try {
    await Promise.all(unread.map((n) => apiPost(`/notifications/${n.id}/read`)));
  } catch (e) {
    error.value = errorMessage(e, t('notifications.center.markAllFailed'));
    await load();
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      :title="unreadCount ? t('notifications.center.titleUnread', { n: fmtAngka(unreadCount) }) : t('notifications.center.title')"
      :subtitle="t('notifications.center.subtitle')"
    >
      <template #actions>
        <button class="btn-outline" :disabled="!unreadCount" @click="markAllRead">
          {{ t('notifications.center.markAllRead') }}
        </button>
        <RouterLink to="/d/notifikasi/preferensi" class="btn-outline">{{ t('notifications.center.preferences') }}</RouterLink>
        <!-- Halaman monitor sudah punya tombol "kembali" ke sini, tapi tidak ada
             satu pun jalan masuk — hanya bisa dibuka dengan mengetik URL. -->
        <RouterLink v-can="'notifikasi.update'" to="/d/notifikasi/monitor" class="btn-outline">
          {{ t('notifications.center.monitor') }}
        </RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex gap-2">
      <select v-model="filterBaca" class="input max-w-[200px]" @change="load">
        <option value="">{{ t('notifications.center.all') }}</option>
        <option value="false">{{ t('notifications.center.unread') }}</option>
        <option value="true">{{ t('notifications.center.read') }}</option>
      </select>
    </div>

    <div v-if="loading" class="text-slate-400">{{ t('notifications.center.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
    <p v-else-if="!notifications.length" class="empty-state">{{ t('notifications.center.empty') }}</p>
    <div v-else class="space-y-2">
      <button
        v-for="n in notifications"
        :key="n.id"
        class="card flex w-full items-start gap-3 p-3 text-start hover:shadow-md"
        :class="!n.dibaca && 'border-s-4 border-brand-500 bg-brand-50/40'"
        @click="markRead(n)"
      >
        <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="n.dibaca ? 'bg-transparent' : 'bg-accent-500'"></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-slate-800">{{ n.judul }}</span>
            <span class="shrink-0 text-xs text-slate-400">{{ fmtRelatif(n.dibuat_at) }}</span>
          </div>
          <p v-if="n.isi" class="mt-0.5 text-sm text-slate-500">{{ n.isi }}</p>
          <span class="mt-1 inline-block text-xs text-slate-400">{{ n.tipe }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
