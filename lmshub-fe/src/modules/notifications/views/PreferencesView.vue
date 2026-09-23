<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPut, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';

interface ChannelPref {
  jenis_event: string;
  label: string;
  kritikal?: boolean;
  in_app: boolean;
  email: boolean;
  wa: boolean;
  push: boolean;
}

// BE menyimpan kanal WA sebagai 'whatsapp' (bukan 'wa')
const CHANNEL_TO_KANAL: Record<'in_app' | 'email' | 'wa' | 'push', string> = {
  in_app: 'in_app',
  email: 'email',
  wa: 'whatsapp',
  push: 'push',
};

const { t } = useI18n();

const CHANNEL_KEYS = ['in_app', 'email', 'wa', 'push'] as const;
const channels = computed(() =>
  CHANNEL_KEYS.map((key) => ({ key, label: t(`notifications.prefs.channel.${key}`) })),
);

const matrix = ref<ChannelPref[]>([]);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const savedAt = ref<number | null>(null);

interface EventConfigRow {
  jenis_event: string;
  nama: string;
  kanal: string[];
  is_kritikal: boolean;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE tidak punya GET/PUT /notifications/preferences — konfigurasi kanal per event
    // ada di GET /notifications/event-config (field `kanal`, bukan matriks boolean in_app/email/wa/push).
    const res = await apiGetFull<EventConfigRow[]>('/notifications/event-config');
    matrix.value = (res.data ?? []).map((row) => ({
      jenis_event: row.jenis_event,
      label: row.nama,
      kritikal: row.is_kritikal,
      in_app: row.kanal.includes('in_app'),
      email: row.kanal.includes('email'),
      wa: row.kanal.includes('whatsapp'),
      push: row.kanal.includes('push'),
    }));
  } catch (e) {
    error.value = errorMessage(e, t('notifications.prefs.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    // BE hanya punya PUT /notifications/event-config/:jenisEvent (satu event per panggilan)
    await Promise.all(
      matrix.value.map((row) => {
        const kanal = (Object.keys(CHANNEL_TO_KANAL) as Array<keyof typeof CHANNEL_TO_KANAL>)
          .filter((k) => row[k])
          .map((k) => CHANNEL_TO_KANAL[k]);
        return apiPut(`/notifications/event-config/${row.jenis_event}`, { kanal });
      }),
    );
    savedAt.value = Date.now();
  } catch (e) {
    error.value = errorMessage(e, t('notifications.prefs.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('notifications.prefs.title')" :subtitle="t('notifications.prefs.subtitle')">
      <template #actions>
        <RouterLink to="/d/notifikasi" class="btn-outline">{{ t('notifications.prefs.back') }}</RouterLink>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('notifications.prefs.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
    <p v-else-if="!matrix.length" class="empty-state">{{ t('notifications.prefs.empty') }}</p>
    <template v-else>
      <!-- Desktop: tabel matriks -->
      <div class="card hidden overflow-x-auto sm:block">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-3 font-medium">{{ t('notifications.prefs.colEvent') }}</th>
              <th v-for="c in channels" :key="c.key" class="px-4 py-3 text-center font-medium">{{ c.label }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in matrix" :key="row.jenis_event">
              <td class="px-4 py-3 text-slate-700">
                {{ row.label }}
                <span v-if="row.kritikal" class="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {{ t('notifications.prefs.alwaysOn') }}
                </span>
              </td>
              <td v-for="c in channels" :key="c.key" class="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  v-model="row[c.key]"
                  :disabled="row.kritikal"
                  :title="row.kritikal ? t('notifications.prefs.criticalHint') : ''"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile: accordion per event -->
      <div class="space-y-3 sm:hidden">
        <div v-for="row in matrix" :key="row.jenis_event" class="card p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-medium text-slate-800">{{ row.label }}</span>
            <span v-if="row.kritikal" class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {{ t('notifications.prefs.alwaysOn') }}
            </span>
          </div>
          <div class="flex flex-wrap gap-3">
            <label v-for="c in channels" :key="c.key" class="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" v-model="row[c.key]" :disabled="row.kritikal" />
              {{ c.label }}
            </label>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <button class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? t('common.state.saving') : t('notifications.prefs.save') }}
        </button>
        <span v-if="savedAt" class="text-xs text-emerald-600">{{ t('notifications.prefs.saved') }}</span>
      </div>
    </template>
  </div>
</template>
