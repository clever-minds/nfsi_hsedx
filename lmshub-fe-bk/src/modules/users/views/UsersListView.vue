<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface UserRow extends Record<string, unknown> {
  id: string;
  nama_lengkap: string;
  email: string | null;
  nomor_wa: string | null;
  role_kode: string;
  role_nama: string;
  status: string;
  created_by: string | null;
  created_by_nama: string | null;
  created_at: string;
}

interface RoleOption {
  id: string;
  kode: string;
  nama: string;
  level: number;
}

const { t } = useI18n();

const rows = ref<UserRow[]>([]);
const roleOptions = ref<RoleOption[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;

const q = ref('');
const roleFilter = ref('');
const statusFilter = ref('');

const loading = ref(true);
const error = ref('');
const verifyingId = ref<string | null>(null);

const columns = computed(() => [
  { key: 'nama_lengkap', label: t('users.list.colUser') },
  { key: 'role_nama', label: t('users.list.colRole') },
  { key: 'created_by_nama', label: t('users.list.colCreatedBy') },
  { key: 'status', label: t('users.list.colStatus') },
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<UserRow[]>('/users', {
      page: page.value,
      limit,
      q: q.value || undefined,
      'filter[role]': roleFilter.value || undefined,
      'filter[status]': statusFilter.value || undefined,
    });
    rows.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? rows.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('users.list.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  try {
    roleOptions.value = await apiGetFull<RoleOption[]>('/users/_roles').then((r) => r.data ?? []);
  } catch {
    roleOptions.value = [];
  }
}

function search() {
  page.value = 1;
  load();
}


async function verify(id: string, aksi: 'approve' | 'reject') {
  verifyingId.value = id;
  try {
    await apiPost(`/users/${id}/verify`, { aksi });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('users.list.verifyFailed'));
  } finally {
    verifyingId.value = null;
  }
}

watch(page, load);
onMounted(() => {
  loadRoles();
  load();
});
</script>

<template>
  <div>
    <PageHeader :title="t('users.list.title')" :subtitle="t('users.list.subtitle')">
      <template #actions>
        <RouterLink v-can="'pengguna.create'" to="/d/pengguna/tambah" class="btn-primary">{{ t('users.list.add') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('users.list.empty')">
      <template #toolbar>
        <input v-model="q" class="input max-w-xs" :placeholder="t('users.list.searchPlaceholder')" @keyup.enter="search" />
        <select v-model="roleFilter" class="input w-auto" @change="search">
          <option value="">{{ t('users.list.allRoles') }}</option>
          <option v-for="r in roleOptions" :key="r.id" :value="r.kode">{{ r.nama }}</option>
        </select>
        <select v-model="statusFilter" class="input w-auto" @change="search">
          <option value="">{{ t('users.list.allStatus') }}</option>
          <option value="pending">{{ t('users.list.statusPending') }}</option>
          <option value="active">{{ t('users.list.statusActive') }}</option>
          <option value="inactive">{{ t('users.list.statusInactive') }}</option>
        </select>
        <button class="btn-outline" @click="search">{{ t('common.action.search') }}</button>
      </template>
      <template #cell:nama_lengkap="{ row }">
        <div class="font-medium text-slate-800">{{ (row as unknown as UserRow).nama_lengkap }}</div>
        <div class="text-xs text-slate-400">{{ (row as unknown as UserRow).email || (row as unknown as UserRow).nomor_wa || '—' }}</div>
      </template>
      <template #cell:created_by_nama="{ value }">
        {{ value || t('users.list.selfRegistered') }}
      </template>
      <template #cell:status="{ value }">
        <StatusChip :status="String(value)" />
      </template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <template v-if="(row as unknown as UserRow).status === 'pending'">
            <button
              v-can="'pengguna.update'"
              class="row-link row-link-positive"
              :disabled="verifyingId === (row as unknown as UserRow).id"
              @click="verify((row as unknown as UserRow).id, 'approve')"
            >
              {{ t('users.list.approve') }}
            </button>
            <button
              v-can="'pengguna.update'"
              class="row-link row-link-danger"
              :disabled="verifyingId === (row as unknown as UserRow).id"
              @click="verify((row as unknown as UserRow).id, 'reject')"
            >
              {{ t('users.list.reject') }}
            </button>
          </template>
          <RouterLink
            v-can="'pengguna.update'"
            :to="`/d/pengguna/${(row as unknown as UserRow).id}/ubah`"
            class="row-link row-link-primary"
          >
            {{ t('users.list.edit') }}
          </RouterLink>
        </div>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event" />
      </template>
    </DataTable>
  </div>
</template>
