<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGet, errorMessage } from '@/lib/api';
import DashboardSiswa from '../components/DashboardSiswa.vue';
import DashboardInstruktur from '../components/DashboardInstruktur.vue';
import DashboardOps from '../components/DashboardOps.vue';

const auth = useAuthStore();
const { t } = useI18n();

const data = ref<Record<string, unknown>>({});
const error = ref('');
const loading = ref(true);

// sub_user memakai dashboard siswa; asisten memakai dashboard instruktur (selaras alias BE).
const layout = computed(() => {
  const role = auth.activeRole || 'siswa';
  if (role === 'siswa' || role === 'sub_user') return 'siswa';
  if (role === 'instruktur' || role === 'asisten') return 'instruktur';
  return 'ops';
});

onMounted(async () => {
  try {
    data.value = await apiGet<Record<string, unknown>>(`/dashboard/${auth.activeRole || 'siswa'}`);
  } catch (e) {
    error.value = errorMessage(e, t('dashboard.unavailable'));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
    <DashboardSiswa v-else-if="layout === 'siswa'" :data="data" />
    <DashboardInstruktur v-else-if="layout === 'instruktur'" :data="data" />
    <DashboardOps v-else :data="data" />
  </div>
</template>
