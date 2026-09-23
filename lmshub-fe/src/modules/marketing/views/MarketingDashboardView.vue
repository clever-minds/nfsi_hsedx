<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPatch, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtRp } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface Lead {
  id: string;
  nama: string;
  kontak?: string;
  minat_kursus?: string;
  nilai_estimasi?: number;
  catatan?: string;
  stage: string; // lead | prospek | closing
}
interface Commission {
  id: string;
  order_kode?: string;
  nominal: number;
  rate?: number;
  status: string;
}
interface ReferralLink {
  id: string;
  kode: string;
  url?: string;
  kunjungan?: number;
  konversi?: number;
}
interface LeaderboardRow {
  id: string;
  nama: string;
  total_closing?: number;
  total_komisi?: number;
}

const auth = useAuthStore();
const { t } = useI18n();

const STAGE_KEYS = ['lead', 'prospek', 'closing'] as const;
const STAGES = computed(() => STAGE_KEYS.map((key) => ({ key, label: t(`marketing.stage.${key}`) })));

const leads = ref<Lead[]>([]);
const commissions = ref<Commission[]>([]);
const referralLinks = ref<ReferralLink[]>([]);
const leaderboard = ref<LeaderboardRow[]>([]);

const loading = ref(true);
const error = ref('');
const moveBusyId = ref<string | null>(null);
const copied = ref(false);

const kpi = reactive({ targetClosing: 0, tercapaiClosing: 0, komisiBulan: 0, komisiCair: 0 });

const showAddLead = ref(false);
const newLead = reactive({ nama: '', kontak: '', minat_kursus: '', nilai_estimasi: 0 });
const addingLead = ref(false);

function columnFor(stage: string): Lead[] {
  return leads.value.filter((l) => l.stage === stage);
}

const komisiBulanDisplay = computed(
  () => kpi.komisiBulan || commissions.value.reduce((s, c) => s + Number(c.nominal || 0), 0),
);
const komisiCairDisplay = computed(
  () =>
    kpi.komisiCair ||
    commissions.value
      .filter((c) => /cair|selesai/i.test(c.status))
      .reduce((s, c) => s + Number(c.nominal || 0), 0),
);
const tercapaiDisplay = computed(() => kpi.tercapaiClosing || columnFor('closing').length);

async function loadDashboardKpi() {
  try {
    const d = await apiGet<Record<string, number>>('/marketing/dashboard');
    kpi.targetClosing = Number(d.target_closing ?? 0);
    kpi.tercapaiClosing = Number(d.closing_bulan ?? d.tercapai_closing ?? 0);
    kpi.komisiBulan = Number(d.komisi_bulan ?? 0);
    kpi.komisiCair = Number(d.komisi_cair ?? 0);
  } catch {
    /* fallback dihitung dari leads & commissions di computed */
  }
}

async function loadLeads() {
  try {
    const res = await apiGetFull<Lead[]>('/marketing/leads');
    leads.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('marketing.loadLeadsFailed'));
    leads.value = [];
  }
}

async function loadCommissions() {
  try {
    const res = await apiGetFull<Commission[]>('/marketing/commissions');
    commissions.value = res.data ?? [];
  } catch {
    commissions.value = [];
  }
}

async function loadReferralLinks() {
  try {
    const res = await apiGetFull<ReferralLink[]>('/marketing/referral-links');
    referralLinks.value = res.data ?? [];
  } catch {
    referralLinks.value = [];
  }
}

async function loadLeaderboard() {
  try {
    const res = await apiGetFull<LeaderboardRow[]>('/marketing/leaderboard');
    leaderboard.value = res.data ?? [];
  } catch {
    leaderboard.value = [];
  }
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  await Promise.all([loadDashboardKpi(), loadLeads(), loadCommissions(), loadReferralLinks(), loadLeaderboard()]);
  loading.value = false;
}

function nextStage(stage: string): string | null {
  const idx = STAGE_KEYS.indexOf(stage as (typeof STAGE_KEYS)[number]);
  return idx >= 0 && idx < STAGE_KEYS.length - 1 ? STAGE_KEYS[idx + 1] : null;
}

/** Label tahap berikutnya untuk tombol "Pindah →". */
function nextStageLabel(stage: string): string {
  const next = nextStage(stage);
  return next ? t(`marketing.stage.${next}`) : '';
}

async function moveStage(lead: Lead) {
  const to = nextStage(lead.stage);
  if (!to) return;
  const prev = lead.stage;
  lead.stage = to; // optimistic
  moveBusyId.value = lead.id;
  try {
    await apiPatch(`/marketing/leads/${lead.id}/stage`, { stage: to });
  } catch (e) {
    lead.stage = prev; // rollback
    error.value = errorMessage(e, t('marketing.moveFailed'));
  } finally {
    moveBusyId.value = null;
  }
}

async function addLead() {
  if (!newLead.nama) return;
  addingLead.value = true;
  try {
    await apiPost('/marketing/leads', { ...newLead, stage: 'lead' });
    showAddLead.value = false;
    newLead.nama = '';
    newLead.kontak = '';
    newLead.minat_kursus = '';
    newLead.nilai_estimasi = 0;
    await loadLeads();
  } catch (e) {
    error.value = errorMessage(e, t('marketing.addLeadFailed'));
  } finally {
    addingLead.value = false;
  }
}

/**
 * Alamat link referral. Domain diambil dari origin situs yang sedang dibuka,
 * bukan ditulis tetap: setiap pemasang punya domain sendiri, dan link yang
 * menunjuk domain lain tidak akan pernah mengkonversi.
 */
function referralUrl(link: ReferralLink) {
  return link.url || `${window.location.origin}/r/${link.kode}`;
}

async function copyReferral(link: ReferralLink) {
  const url = referralUrl(link);
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard tidak tersedia, abaikan */
  }
}

onMounted(loadAll);
</script>

<template>
  <div>
    <PageHeader :title="t('marketing.title')" :subtitle="t('marketing.subtitle')" />

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <template v-else>
      <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

      <!-- KPI -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          :label="t('marketing.targetClosing')"
          :value="`${fmtAngka(tercapaiDisplay)} / ${kpi.targetClosing ? fmtAngka(kpi.targetClosing) : '—'}`"
          :hint="t('marketing.targetHint')"
        />
        <KpiCard :label="t('marketing.closingThisMonth')" :value="fmtAngka(tercapaiDisplay)" />
        <KpiCard :label="t('marketing.commissionThisMonth')" :value="fmtRp(komisiBulanDisplay)" accent />
        <KpiCard :label="t('marketing.commissionPaid')" :value="fmtRp(komisiCairDisplay)" accent />
      </div>

      <!-- Referral -->
      <div class="card mt-6 p-4">
        <h2 class="section-title">{{ t('marketing.referralTitle') }}</h2>
        <div v-if="!referralLinks.length" class="mt-2 text-sm text-slate-400">{{ t('marketing.referralEmpty') }}</div>
        <div v-for="link in referralLinks" :key="link.id" class="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <code class="rounded bg-slate-100 px-2 py-1">{{ referralUrl(link).replace(/^https?:\/\//, '') }}</code>
          <span class="text-slate-500">
            {{ t('marketing.referralStats', { visits: fmtAngka(link.kunjungan ?? 0), conversions: fmtAngka(link.konversi ?? 0) }) }}
          </span>
          <button class="btn-outline btn-sm" @click="copyReferral(link)">
            {{ copied ? t('marketing.copied') : t('marketing.copyLink') }}
          </button>
        </div>
      </div>

      <!-- Pipeline Kanban -->
      <div class="mt-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="section-title">{{ t('marketing.pipelineTitle') }}</h2>
          <button v-can="'marketing.update'" class="btn-primary" @click="showAddLead = !showAddLead">
            {{ t('marketing.addLead') }}
          </button>
        </div>

        <form v-if="showAddLead" class="card mb-4 grid gap-3 p-4 sm:grid-cols-2" @submit.prevent="addLead">
          <div>
            <label class="label">{{ t('marketing.leadName') }}</label>
            <input v-model="newLead.nama" class="input" required />
          </div>
          <div>
            <label class="label">{{ t('marketing.leadContact') }}</label>
            <input v-model="newLead.kontak" class="input" />
          </div>
          <div>
            <label class="label">{{ t('marketing.leadInterest') }}</label>
            <input v-model="newLead.minat_kursus" class="input" />
          </div>
          <div>
            <label class="label">{{ t('marketing.leadValue') }}</label>
            <input v-model.number="newLead.nilai_estimasi" type="number" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button class="btn-primary" :disabled="addingLead">
              {{ addingLead ? t('common.state.saving') : t('marketing.saveLead') }}
            </button>
          </div>
        </form>

        <div class="flex gap-4 overflow-x-auto pb-2">
          <div v-for="stage in STAGES" :key="stage.key" class="w-72 flex-shrink-0">
            <div class="mb-2 flex items-center justify-between px-1">
              <h3 class="text-sm font-semibold text-slate-600">{{ stage.label }}</h3>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {{ fmtAngka(columnFor(stage.key).length) }}
              </span>
            </div>
            <div class="space-y-2">
              <div v-if="!columnFor(stage.key).length" class="card p-4 text-center text-xs text-slate-400">
                {{ t('marketing.stageEmpty') }}
              </div>
              <div v-for="lead in columnFor(stage.key)" :key="lead.id" class="card p-3">
                <div class="font-medium text-slate-800">{{ lead.nama }}</div>
                <div v-if="lead.minat_kursus" class="text-xs text-slate-500">
                  {{ t('marketing.interest', { value: lead.minat_kursus }) }}
                </div>
                <div v-if="lead.nilai_estimasi" class="text-xs text-accent-500">{{ fmtRp(lead.nilai_estimasi) }}</div>
                <div class="mt-2 flex gap-2">
                  <button
                    v-if="nextStage(lead.stage)"
                    v-can="'marketing.update'"
                    class="btn-outline btn-sm"
                    :disabled="moveBusyId === lead.id"
                    @click="moveStage(lead)"
                  >
                    {{ t('marketing.moveTo', { stage: nextStageLabel(lead.stage) }) }}
                  </button>
                  <RouterLink
                    v-if="stage.key === 'closing'"
                    v-can="'transaksi.create'"
                    class="btn-primary btn-sm"
                    :to="{ name: 'transaksi-tanda-jadi', query: { lead_id: lead.id } }"
                  >
                    {{ t('marketing.recordDeposit') }}
                  </RouterLink>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p class="mt-2 text-xs text-slate-400">{{ t('marketing.scrollHint') }}</p>
      </div>

      <!-- Komisi -->
      <div class="card mt-6 p-4">
        <h2 class="section-title">{{ t('marketing.commissionTitle') }}</h2>
        <div v-if="!commissions.length" class="mt-2 text-sm text-slate-400">{{ t('marketing.commissionEmpty') }}</div>
        <table v-else class="mt-2 w-full text-sm">
          <thead class="text-start text-xs uppercase text-slate-400">
            <tr>
              <th class="py-2">{{ t('marketing.colOrder') }}</th>
              <th class="py-2">{{ t('marketing.colAmount') }}</th>
              <th class="py-2">{{ t('marketing.colRate') }}</th>
              <th class="py-2">{{ t('marketing.colStatus') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="c in commissions" :key="c.id">
              <td class="py-2">{{ c.order_kode ?? '—' }}</td>
              <td class="py-2">{{ fmtRp(c.nominal) }}</td>
              <td class="py-2">{{ c.rate ? `${c.rate}%` : '—' }}</td>
              <td class="py-2"><StatusChip :status="c.status" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Leaderboard -->
      <div class="card mt-6 p-4">
        <h2 class="section-title">{{ t('marketing.leaderboard') }}</h2>
        <div v-if="!leaderboard.length" class="mt-2 text-sm text-slate-400">{{ t('marketing.leaderboardEmpty') }}</div>
        <ol v-else class="mt-2 space-y-1 text-sm">
          <li v-for="(row, i) in leaderboard" :key="row.id" class="flex justify-between">
            <span>{{ fmtAngka(i + 1) }}. {{ row.nama }} {{ auth.user?.id === row.id ? t('marketing.you') : '' }}</span>
            <span class="text-slate-500">
              {{ t('marketing.leaderboardRow', { closings: fmtAngka(row.total_closing ?? 0), commission: fmtRp(row.total_komisi) }) }}
            </span>
          </li>
        </ol>
      </div>
    </template>
  </div>
</template>
