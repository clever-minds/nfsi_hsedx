<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import DataTable from '@/components/ui/DataTable.vue';

interface Badge {
  id: string;
  nama: string;
  deskripsi?: string;
  ikon_url?: string;
  diraih?: boolean;
  diraih_at?: string;
}
interface LeaderboardRow extends Record<string, unknown> {
  peringkat: number;
  nama: string;
  poin: number;
}

const { t } = useI18n();

const badges = ref<Badge[]>([]);
const totalPoin = ref<number | string>('—');
const streak = ref<number | string>('—');
const leaderboard = ref<LeaderboardRow[]>([]);

const loadingBadges = ref(true);
const loadingLeaderboard = ref(true);
const error = ref('');

const leaderboardColumns = computed(() => [
  { key: 'peringkat', label: t('certificates.badgesPage.colRank') },
  { key: 'nama', label: t('certificates.badgesPage.colName') },
  { key: 'poin', label: t('certificates.badgesPage.colPoints') },
]);

interface UserBadge {
  id: string;
  badge_id: string;
  tanggal_diraih: string;
}
interface PointsLedgerRow {
  saldo_setelah: number;
}
interface StreakRow {
  streak_hari_berjalan: number;
}

async function loadBadges() {
  loadingBadges.value = true;
  try {
    // BE tidak punya GET /badges?scope=me. Gabungkan katalog GET /badges (semua badge)
    // dengan GET /users/me/badges (badge yang sudah diraih pengguna) di sisi klien.
    const [catalogRes, earnedRes] = await Promise.all([
      apiGetFull<Badge[]>('/badges', { limit: 100 }),
      apiGetFull<UserBadge[]>('/users/me/badges'),
    ]);
    const earned = new Map((earnedRes.data ?? []).map((u) => [u.badge_id, u.tanggal_diraih]));
    badges.value = (catalogRes.data ?? []).map((b) => ({
      ...b,
      diraih: earned.has(b.id),
      diraih_at: earned.get(b.id),
    }));
  } catch (e) {
    error.value = errorMessage(e, t('certificates.badgesPage.loadBadgesFailed'));
  } finally {
    loadingBadges.value = false;
  }
}

async function loadGamificationSummary() {
  try {
    // BE: /users/me/points adalah ledger berpaginasi (bukan total poin langsung);
    // baris terbaru (limit=1, urut DESC created_at) menyimpan saldo_setelah = saldo poin saat ini.
    const res = await apiGetFull<PointsLedgerRow[]>('/users/me/points', { limit: 1 });
    const latest = res.data?.[0];
    if (latest) totalPoin.value = latest.saldo_setelah;
  } catch {
    /* biarkan totalPoin default '—' */
  }
  try {
    const s = await apiGet<StreakRow | null>('/users/me/streak');
    if (s) streak.value = s.streak_hari_berjalan;
  } catch {
    /* biarkan streak default '—' */
  }
}

async function loadLeaderboard() {
  loadingLeaderboard.value = true;
  try {
    const res = await apiGetFull<LeaderboardRow[]>('/leaderboards');
    leaderboard.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('certificates.badgesPage.loadLeaderboardFailed'));
  } finally {
    loadingLeaderboard.value = false;
  }
}

onMounted(() => {
  loadBadges();
  loadGamificationSummary();
  loadLeaderboard();
});
</script>

<template>
  <div>
    <PageHeader :title="t('certificates.badgesPage.title')" :subtitle="t('certificates.badgesPage.subtitle')">
      <template #actions>
        <RouterLink to="/d/sertifikat" class="btn-outline">{{ t('certificates.badgesPage.myCertificates') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <div class="mb-6 grid gap-4 sm:grid-cols-2">
      <KpiCard
        :label="t('certificates.badgesPage.totalPoints')"
        :value="typeof totalPoin === 'number' ? fmtAngka(totalPoin) : totalPoin"
        accent
      />
      <KpiCard
        :label="t('certificates.badgesPage.streak')"
        :value="typeof streak === 'number' ? fmtAngka(streak) : streak"
        :hint="t('certificates.badgesPage.streakHint')"
      />
    </div>

    <h2 class="section-title mb-3">{{ t('certificates.badgesPage.badgesTitle') }}</h2>
    <div v-if="loadingBadges" class="text-slate-400">{{ t('certificates.badgesPage.loadingBadges') }}</div>
    <p v-else-if="!badges.length" class="empty-state">{{ t('certificates.badgesPage.badgesEmpty') }}</p>
    <div v-else class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div
        v-for="b in badges"
        :key="b.id"
        class="card flex flex-col items-center gap-2 p-3 text-center"
        :class="!b.diraih && 'opacity-40 grayscale'"
      >
        <div class="h-12 w-12 rounded-full bg-accent-100"></div>
        <div class="text-xs font-medium text-slate-700">{{ b.nama }}</div>
      </div>
    </div>

    <h2 class="section-title mb-3">{{ t('certificates.badgesPage.leaderboard') }}</h2>
    <DataTable
      :columns="leaderboardColumns"
      :rows="leaderboard"
      :loading="loadingLeaderboard"
      :empty="t('certificates.badgesPage.leaderboardEmpty')"
    />
  </div>
</template>
