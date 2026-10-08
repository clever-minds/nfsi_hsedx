<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGet, errorMessage } from '@/lib/api';
import StudentDashboard from '../components/DashboardStudent.vue';
import InstructorDashboard from '../components/DashboardInstructor.vue';
import DashboardOps from '../components/DashboardOps.vue';

const auth = useAuthStore();
const { t } = useI18n();

const data = ref<Record<string, unknown>>({});
const error = ref('');
const loading = ref(true);

// sub_user memakai dashboard student; asisten memakai dashboard instructor (selaras alias BE).
const layout = computed(() => {
  const role = auth.activeRole || 'student';
  if (role === 'student' || role === 'sub_user') return 'student';
  if (role === 'instructor' || role === 'asisten') return 'instructor';
  return 'ops';
});

onMounted(async () => {
  try {
    data.value = await apiGet<Record<string, unknown>>(`/dashboard/${auth.activeRole || 'student'}`);
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
    <StudentDashboard v-else-if="layout === 'student'" :data="data" />
    <InstructorDashboard v-else-if="layout === 'instructor'" :data="data" />
    <DashboardOps v-else :data="data" />
  </div>
</template>
