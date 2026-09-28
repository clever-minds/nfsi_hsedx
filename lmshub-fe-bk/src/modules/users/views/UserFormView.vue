<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import { moduleLabel } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';

interface UserDetail {
  id: string;
  nama_lengkap: string;
  email: string | null;
  nomor_wa: string | null;
  role_kode: string;
  role_nama: string;
  status: string;
}
interface RoleOption {
  id: string;
  kode: string;
  nama: string;
  level: number;
}
type Action = 'view' | 'create' | 'update' | 'delete';
interface PermissionCatalogItem {
  module: string;
  action: Action;
}
interface PermissionRow {
  module: string;
  action: Action;
  effect: 'allow' | 'deny';
  source: 'role' | 'override';
}

const ACTIONS: Action[] = ['view', 'create', 'update', 'delete'];

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const actionLabel = (a: Action) => t(`users.action.${a}`);

const userId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!userId.value);

const form = reactive({
  nama_lengkap: '',
  email: '',
  nomor_wa: '',
  password: '',
  role_kode: '',
  status: 'active' as 'pending' | 'active' | 'inactive',
});

const roleOptions = ref<RoleOption[]>([]);
const catalog = ref<PermissionCatalogItem[]>([]);
const checklist = reactive<Record<string, Record<Action, boolean>>>({});

const loading = ref(true);
const saving = ref(false);
const error = ref('');

const modules = computed(() => Array.from(new Set(catalog.value.map((c) => c.module))).sort());

function canGrant(module: string, action: Action): boolean {
  return auth.can(`${module}.${action}`);
}

function initChecklist() {
  for (const c of catalog.value) {
    if (!checklist[c.module]) checklist[c.module] = { view: false, create: false, update: false, delete: false };
  }
}

function applyPermissionRows(rows: PermissionRow[]) {
  const roleRows = rows.filter((r) => r.source === 'role');
  const overrideRows = rows.filter((r) => r.source === 'override');
  for (const r of roleRows) {
    if (checklist[r.module]) checklist[r.module][r.action] = r.effect === 'allow';
  }
  for (const r of overrideRows) {
    if (checklist[r.module]) checklist[r.module][r.action] = r.effect === 'allow';
  }
}

const selectedModuleCount = computed(
  () => modules.value.filter((m) => ACTIONS.some((a) => checklist[m]?.[a])).length,
);

function toggle(module: string, action: Action) {
  if (!canGrant(module, action)) return;
  checklist[module][action] = !checklist[module][action];
}

function applyMyPermissions() {
  for (const m of modules.value) {
    for (const a of ACTIONS) {
      checklist[m][a] = canGrant(m, a);
    }
  }
}

function clearChecklist() {
  for (const m of modules.value) {
    for (const a of ACTIONS) checklist[m][a] = false;
  }
}

const exceedsScope = computed(() => {
  const offending: string[] = [];
  for (const m of modules.value) {
    for (const a of ACTIONS) {
      if (checklist[m]?.[a] && !canGrant(m, a)) offending.push(`${m}.${a}`);
    }
  }
  return offending;
});

async function loadRefData() {
  const [roles, perms] = await Promise.all([
    apiGetFull<RoleOption[]>('/users/_roles').then((r) => r.data ?? []),
    apiGetFull<PermissionCatalogItem[]>('/users/_permissions').then((r) => r.data ?? []),
  ]);
  roleOptions.value = roles;
  catalog.value = perms;
  initChecklist();
}

async function loadUser(id: string) {
  const [detail, perms] = await Promise.all([
    apiGet<UserDetail>(`/users/${id}`),
    apiGetFull<PermissionRow[]>(`/users/${id}/permissions`).then((r) => r.data ?? []),
  ]);
  form.nama_lengkap = detail.nama_lengkap;
  form.email = detail.email ?? '';
  form.nomor_wa = detail.nomor_wa ?? '';
  form.role_kode = detail.role_kode;
  form.status = detail.status as typeof form.status;
  applyPermissionRows(perms);
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    await loadRefData();
    if (userId.value) await loadUser(userId.value);
    else if (!form.role_kode && roleOptions.value.length) form.role_kode = roleOptions.value[0].kode;
  } catch (e) {
    error.value = errorMessage(e, t('users.form.loadFailed'));
  } finally {
    loading.value = false;
  }
});

function permissionPayload() {
  const permissions: Array<{ module: string; action: Action; effect: 'allow' | 'deny' }> = [];
  for (const m of modules.value) {
    for (const a of ACTIONS) {
      permissions.push({ module: m, action: a, effect: checklist[m][a] ? 'allow' : 'deny' });
    }
  }
  return permissions;
}

async function submit() {
  error.value = '';
  if (exceedsScope.value.length) {
    error.value = t('users.form.exceeds', { list: exceedsScope.value.join(', ') });
    return;
  }
  saving.value = true;
  try {
    let id = userId.value;
    if (isEdit.value && id) {
      await apiPut(`/users/${id}`, {
        nama_lengkap: form.nama_lengkap,
        email: form.email || null,
        nomor_wa: form.nomor_wa || null,
        status: form.status,
        role_kode: form.role_kode,
      });
    } else {
      const created = await apiPost<{ id: string }>('/users', {
        nama_lengkap: form.nama_lengkap,
        email: form.email || undefined,
        nomor_wa: form.nomor_wa || undefined,
        password: form.password,
        role_kode: form.role_kode,
        status: form.status === 'inactive' ? 'pending' : form.status,
      });
      id = created.id;
    }
    if (id) {
      await apiPut(`/users/${id}/permissions`, { permissions: permissionPayload() });
    }
    router.push('/d/pengguna');
  } catch (e) {
    error.value = errorMessage(e, t('users.form.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEdit ? t('users.form.titleEdit') : t('users.form.titleNew')"
      :subtitle="t('users.form.subtitle')"
    />

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <form v-else class="space-y-6" @submit.prevent="submit">
      <p v-if="error" class="alert-error">{{ error }}</p>

      <div class="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('users.form.fullName') }}</label>
          <input v-model="form.nama_lengkap" class="input" required :placeholder="t('users.form.fullNamePlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('users.form.role') }}</label>
          <select v-model="form.role_kode" class="input" required>
            <option v-for="r in roleOptions" :key="r.id" :value="r.kode">{{ r.nama }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('users.form.email') }}</label>
          <input v-model="form.email" class="input" type="email" :placeholder="t('users.form.emailPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('users.form.whatsapp') }}</label>
          <input v-model="form.nomor_wa" class="input" :placeholder="t('users.form.whatsappPlaceholder')" />
        </div>
        <div v-if="!isEdit">
          <label class="label">{{ t('users.form.initialPassword') }}</label>
          <input
            v-model="form.password"
            class="input"
            type="password"
            required
            minlength="8"
            :placeholder="t('users.form.passwordPlaceholder')"
          />
        </div>
        <div>
          <label class="label">{{ t('users.form.status') }}</label>
          <select v-model="form.status" class="input">
            <option value="pending">{{ t('users.list.statusPending') }}</option>
            <option value="active">{{ t('users.list.statusActive') }}</option>
            <option v-if="isEdit" value="inactive">{{ t('users.list.statusInactive') }}</option>
          </select>
        </div>
      </div>

      <div class="card p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="font-medium text-slate-800">{{ t('users.form.permTitle') }}</h2>
            <p class="text-xs text-slate-400">{{ t('users.form.permHint', { n: fmtAngka(selectedModuleCount) }) }}</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-outline btn-sm" @click="applyMyPermissions">
              {{ t('users.form.matchMine') }}
            </button>
            <button type="button" class="btn-outline btn-sm" @click="clearChecklist">{{ t('users.form.clear') }}</button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[480px] text-sm">
            <thead class="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-3 py-2 font-medium">{{ t('users.form.colModule') }}</th>
                <th v-for="a in ACTIONS" :key="a" class="px-3 py-2 text-center font-medium">{{ actionLabel(a) }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="m in modules" :key="m">
                <td class="px-3 py-2 font-medium text-slate-700">{{ moduleLabel(m) }}</td>
                <td v-for="a in ACTIONS" :key="a" class="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    :checked="checklist[m]?.[a]"
                    :disabled="!canGrant(m, a)"
                    :title="!canGrant(m, a) ? t('users.form.beyondScope') : ''"
                    @change="toggle(m, a)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="btn-primary" type="submit" :disabled="saving">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
        <RouterLink to="/d/pengguna" class="btn-outline">{{ t('common.action.cancel') }}</RouterLink>
      </div>
    </form>
  </div>
</template>
