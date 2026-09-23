<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { fmtAngka, fmtHari, fmtRelatif, fmtRp, fmtTanggalSaja, initialsOf } from '@/lib/format';
import { kpiLabel, queueLabel, roleLabel, statusLabel } from '@/lib/labels';
import { chartColor, type DonutSegment } from '@/lib/chart-palette';
import KpiCard from '@/components/ui/KpiCard.vue';
import DonutChart from '@/components/ui/DonutChart.vue';
import Icon from '@/components/ui/Icon.vue';

interface TrenHari { tanggal: string; jumlah: number }
interface KursusPopuler { id: string; judul: string; jumlah_siswa: number | null; rating_avg: string | null; instructor_nama: string }
interface PendaftaranBaru { id: string; user_nama: string; course_judul: string; status: string; created_at: string }
interface AntreanPayout { id: string; nominal_total: string; status: string; created_at: string }
interface AuditItem { id: string; modul: string; aksi: string; entity_type: string | null; waktu: string }
interface KomposisiRow { status: string; jumlah: number }
interface TopInstruktur { id: string; nama: string; foto_profil: string | null; jumlah_kursus: number; total_siswa: number; rating_avg: string | null }
interface TransaksiBaru { id: string; pembeli_nama: string; jalur: string; status: string; total: string; created_at: string }

const props = defineProps<{ data: Record<string, unknown> }>();
const auth = useAuthStore();
const { t } = useI18n();

const MONEY_RE = /pendapatan|revenue|laba|pengeluaran|komisi/;

const iconFor = (label: string) => {
  const l = label.toLowerCase();
  if (MONEY_RE.test(l) || l.includes('payout') || l.includes('pembayaran') || l.includes('refund')) return 'credit-card';
  if (l.includes('kursus')) return 'book-open';
  if (l.includes('pengguna') || l.includes('siswa') || l.includes('pendaftaran') || l.includes('enrollment')) return 'users';
  if (l.includes('live')) return 'video';
  if (l.includes('rating')) return 'award';
  return 'bar-chart';
};

/** KPI dari field skalar + flatten `antrean_approval` (direktur). */
const kpis = computed(() => {
  const out: Array<{ label: string; value: string | number; icon: string }> = [];
  for (const [k, v] of Object.entries(props.data)) {
    if (typeof v === 'number' || typeof v === 'string') {
      out.push({ label: kpiLabel(k), value: MONEY_RE.test(k) ? fmtRp(v) : fmtAngka(v), icon: iconFor(k) });
    }
  }
  const antrean = props.data.antrean_approval as Record<string, number> | undefined;
  if (antrean && typeof antrean === 'object') {
    for (const [k, v] of Object.entries(antrean)) {
      out.push({ label: t('dashboard.queue.prefix', { name: queueLabel(k) }), value: fmtAngka(v), icon: 'clipboard' });
    }
  }
  return out.slice(0, 8);
});

const tren = computed(() => (props.data.tren_enrollment_7hari as TrenHari[] | undefined) ?? []);
const trenMax = computed(() => Math.max(1, ...tren.value.map((t) => t.jumlah)));
const trenTotal = computed(() => tren.value.reduce((a, t) => a + t.jumlah, 0));
const kursusPopuler = computed(() => (props.data.kursus_terpopuler as KursusPopuler[] | undefined) ?? []);
const pendaftaranTerbaru = computed(() => (props.data.pendaftaran_terbaru as PendaftaranBaru[] | undefined) ?? []);
const antreanPayout = computed(() => (props.data.antrean_payout as AntreanPayout[] | undefined) ?? []);
const auditTerbaru = computed(() => (props.data.audit_terbaru as AuditItem[] | undefined) ?? []);

// ── Komposisi (donut) ──────────────────────────────────────────────────────

/**
 * Urutan status yang menentukan slot warna. Sengaja dipatok di sini, bukan
 * mengikuti urutan kiriman backend (yang tersusun menurun berdasarkan jumlah):
 * kalau warna ikut peringkat, satu status bisa berganti warna hanya karena
 * angkanya naik, dan pembaca kehilangan jangkarnya.
 */
const URUTAN_ORDER = ['menunggu_pembayaran', 'dp_cicilan_berjalan', 'lunas', 'akses_aktif', 'batal'];
const URUTAN_ENROLLMENT = ['terdaftar', 'aktif', 'selesai', 'kedaluwarsa', 'batal'];

/**
 * Peran yang dapat slot warnanya sendiri. Sisanya dilebur jadi satu segmen
 * "lainnya": palet hanya punya lima slot dan tidak boleh didaur ulang, jadi
 * peran ke-enam dan seterusnya lebih jujur diringkas daripada dipaksa berwarna
 * sama dengan peran lain.
 */
const URUTAN_PERAN = ['siswa', 'instruktur', 'admin_ops', 'marketing'];
const PERAN_LAINNYA = 'lainnya';

/**
 * `label` menentukan katalog terjemahan yang dipakai. Donut peran berisi kode
 * peran (`siswa`, `instruktur`), bukan kode status, sehingga memakai
 * `statusLabel` untuk semuanya membuat legenda peran jatuh ke kode mentah dan
 * menampilkan "Siswa"/"Instruktur" di UI berbahasa apa pun.
 */
function toSegments(
  rows: KomposisiRow[],
  urutan: string[],
  label: (code: string) => string = statusLabel,
): DonutSegment[] {
  return rows
    .map((r) => ({
      key: r.status,
      label: label(r.status),
      value: Number(r.jumlah) || 0,
      // Status di luar daftar tetap ditaruh di slot terakhir agar tetap tampil.
      color: chartColor(urutan.indexOf(r.status) === -1 ? urutan.length : urutan.indexOf(r.status)),
    }))
    .sort((a, b) => urutan.indexOf(a.key) - urutan.indexOf(b.key));
}

const segmenOrder = computed(() =>
  toSegments((props.data.komposisi_order as KomposisiRow[] | undefined) ?? [], URUTAN_ORDER),
);
const segmenEnrollment = computed(() =>
  toSegments((props.data.komposisi_enrollment as KomposisiRow[] | undefined) ?? [], URUTAN_ENROLLMENT),
);

/** Peran di luar daftar tetap digabung jadi satu segmen sebelum diberi warna. */
const segmenPeran = computed(() => {
  const rows = (props.data.komposisi_peran as KomposisiRow[] | undefined) ?? [];
  const utama = rows.filter((r) => URUTAN_PERAN.includes(r.status));
  const sisa = rows
    .filter((r) => !URUTAN_PERAN.includes(r.status))
    .reduce((a, r) => a + (Number(r.jumlah) || 0), 0);
  const seg = toSegments(utama, URUTAN_PERAN, roleLabel);
  if (sisa > 0) {
    seg.push({
      key: PERAN_LAINNYA,
      label: t('dashboard.ops.otherRoles'),
      value: sisa,
      color: chartColor(URUTAN_PERAN.length),
    });
  }
  return seg;
});

/** Donut hanya bermakna bila ada minimal dua bagian yang terisi. */
const punyaKomposisi = (seg: DonutSegment[]) => seg.filter((s) => s.value > 0).length >= 2;

/**
 * Donut yang layak digambar. Dikumpulkan jadi satu daftar supaya jumlah kolom
 * bisa mengikuti berapa yang benar-benar ada — satu donut sendirian di baris
 * yang dirancang untuk dua akan menyisakan separuh kartu kosong.
 */
const donuts = computed(() =>
  [
    { key: 'order', segments: segmenOrder.value },
    { key: 'enrollment', segments: segmenEnrollment.value },
    { key: 'peran', segments: segmenPeran.value },
  ].filter((d) => punyaKomposisi(d.segments)),
);

/** Tiga donut muat sebaris di layar lebar; dua atau empat lebih rapi dua kolom. */
const kolomDonut = computed(() =>
  donuts.value.length === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2',
);

const topInstruktur = computed(() => (props.data.top_instruktur as TopInstruktur[] | undefined) ?? []);
const transaksiTerbaru = computed(() => (props.data.transaksi_terbaru as TransaksiBaru[] | undefined) ?? []);

/** Warna badge status transaksi — status, bukan kategori, jadi paletnya terpisah. */
function badgeStatus(status: string): string {
  if (status === 'lunas' || status === 'akses_aktif') return 'bg-emerald-50 text-emerald-700';
  if (status === 'batal') return 'bg-rose-50 text-rose-700';
  if (status === 'dp_cicilan_berjalan') return 'bg-sky-50 text-sky-700';
  return 'bg-amber-50 text-amber-700';
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[1fr,20rem]">
    <!-- Kolom utama -->
    <div class="min-w-0 space-y-8">
      <div>
        <h1 class="text-xl font-medium text-slate-900 sm:text-2xl">
          {{ t('dashboard.greeting', { name: auth.user?.nama_lengkap }) }}
        </h1>
        <p class="mt-1 text-sm text-slate-400">{{ t('dashboard.ops.platformSummary', { role: roleLabel(auth.activeRole) }) }}</p>
      </div>

      <!-- KPI -->
      <section>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :icon="k.icon" />
        </div>
      </section>

      <!-- Tren pendaftaran 7 hari -->
      <section v-if="tren.length" class="card p-5">
        <div class="flex items-baseline justify-between">
          <h2 class="section-title">{{ t('dashboard.ops.trend7') }}</h2>
          <span class="text-sm text-slate-400">
            <i18n-t keypath="dashboard.ops.trendTotal" tag="span" scope="global">
              <template #n><b class="text-slate-700">{{ fmtAngka(trenTotal) }}</b></template>
            </i18n-t>
          </span>
        </div>
        <!-- Bar chart satu seri: warna brand, ujung data rounded, gap antar bar, tooltip per bar -->
        <div class="mt-5 flex h-32 items-end gap-2" role="img" :aria-label="t('dashboard.ops.trendAria', { n: trenTotal })">
          <div
            v-for="bar in tren"
            :key="bar.tanggal"
            class="group relative flex h-full flex-1 flex-col justify-end"
            :aria-label="t('dashboard.ops.trendBarAria', { day: fmtHari(bar.tanggal), n: bar.jumlah })"
          >
            <!-- tooltip -->
            <div
              class="pointer-events-none absolute -top-9 start-1/2 z-10 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100"
            >
              {{ fmtAngka(bar.jumlah) }} · {{ fmtTanggalSaja(bar.tanggal) }}
            </div>
            <!-- label langsung hanya pada nilai puncak -->
            <div v-if="bar.jumlah === trenMax && bar.jumlah > 0" class="mb-1 text-center text-[11px] font-medium text-slate-500">
              {{ fmtAngka(bar.jumlah) }}
            </div>
            <div
              class="w-full rounded-t transition group-hover:opacity-80"
              :class="bar.jumlah > 0 ? 'bg-brand-500' : 'bg-slate-200'"
              :style="{ height: bar.jumlah > 0 ? `${Math.max(6, (bar.jumlah / trenMax) * 100)}%` : '3px' }"
            ></div>
          </div>
        </div>
        <div class="mt-2 flex gap-2 border-t border-slate-100 pt-2">
          <div v-for="bar in tren" :key="bar.tanggal" class="flex-1 text-center text-[11px] text-slate-400">{{ fmtHari(bar.tanggal) }}</div>
        </div>
      </section>

      <!-- Komposisi: order, pendaftaran, dan peran pengguna -->
      <section v-if="donuts.length" class="grid gap-6" :class="kolomDonut">
        <div v-for="d in donuts" :key="d.key" class="card p-5">
          <h2 class="section-title">{{ t(`dashboard.ops.mix.${d.key}.title`) }}</h2>
          <p class="mt-0.5 text-xs text-slate-400">{{ t(`dashboard.ops.mix.${d.key}.hint`) }}</p>
          <div class="mt-4">
            <DonutChart :segments="d.segments" :total-label="t(`dashboard.ops.mix.${d.key}.total`)" />
          </div>
        </div>
      </section>

      <!-- Transaksi baru -->
      <section v-if="transaksiTerbaru.length">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">{{ t('dashboard.ops.recentTransactions') }}</h2>
          <RouterLink v-if="auth.can('transaksi.view')" to="/d/transaksi" class="section-link">
            {{ t('dashboard.student.seeAll') }}
          </RouterLink>
        </div>
        <div class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th class="px-4 py-2.5 text-start font-medium">{{ t('dashboard.ops.buyer') }}</th>
                <th class="px-4 py-2.5 text-start font-medium">{{ t('dashboard.ops.status') }}</th>
                <th class="px-4 py-2.5 text-end font-medium">{{ t('dashboard.ops.amount') }}</th>
                <th class="px-4 py-2.5 text-end font-medium">{{ t('dashboard.ops.time') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="trx in transaksiTerbaru" :key="trx.id">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2.5">
                    <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-500">
                      {{ initialsOf(trx.pembeli_nama) }}
                    </span>
                    <span class="truncate font-medium text-slate-700">{{ trx.pembeli_nama }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="badgeStatus(trx.status)">
                    {{ statusLabel(trx.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-end font-medium text-slate-800">{{ fmtRp(trx.total) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end text-xs text-slate-400">{{ fmtRelatif(trx.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Kursus terpopuler -->
      <section v-if="kursusPopuler.length">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">
            <i18n-t keypath="dashboard.ops.topCourses" tag="span" scope="global">
              <template #highlight><span class="font-bold">{{ t('dashboard.ops.topCoursesWord') }}</span></template>
            </i18n-t>
          </h2>
          <RouterLink to="/d/laporan" class="section-link">{{ t('dashboard.ops.viewReport') }}</RouterLink>
        </div>
        <div class="card divide-y divide-slate-100">
          <div v-for="(c, i) in kursusPopuler" :key="c.id" class="flex items-center gap-4 p-4">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold" :class="i === 0 ? 'bg-accent-500/15 text-accent-600' : 'bg-slate-100 text-slate-500'">
              {{ i + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate card-title">{{ c.judul }}</h3>
              <div class="text-xs text-slate-400">{{ t('dashboard.ops.byInstructor', { name: c.instructor_nama }) }}</div>
            </div>
            <div class="shrink-0 text-end">
              <div class="flex items-center gap-1 text-sm font-medium text-slate-700">
                <Icon name="users" :size="13" class="text-slate-400" /> {{ fmtAngka(c.jumlah_siswa ?? 0) }}
              </div>
              <div class="text-xs text-accent-500">★ <span class="num">{{ Number(c.rating_avg ?? 0).toFixed(1) }}</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Top pengajar -->
      <section v-if="topInstruktur.length">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">{{ t('dashboard.ops.topInstructors') }}</h2>
          <RouterLink v-if="auth.can('pengguna.view')" to="/d/pengguna" class="section-link">
            {{ t('dashboard.student.seeAll') }}
          </RouterLink>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="(ins, i) in topInstruktur" :key="ins.id" class="card flex items-center gap-3 p-4">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold" :class="i === 0 ? 'bg-accent-500/15 text-accent-600' : 'bg-slate-100 text-slate-500'">
              {{ initialsOf(ins.nama) }}
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate card-title">{{ ins.nama }}</h3>
              <div class="text-xs text-slate-400">
                {{ t('dashboard.ops.courseCount', { n: fmtAngka(ins.jumlah_kursus) }) }}
              </div>
            </div>
            <div class="shrink-0 text-end">
              <div class="flex items-center justify-end gap-1 text-sm font-medium text-slate-700">
                <Icon name="users" :size="13" class="text-slate-400" /> {{ fmtAngka(ins.total_siswa) }}
              </div>
              <div class="text-xs text-accent-500">★ <span class="num">{{ Number(ins.rating_avg ?? 0).toFixed(1) }}</span></div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Rail kanan -->
    <div class="space-y-6">
      <!-- Pendaftaran terbaru -->
      <div v-if="pendaftaranTerbaru.length" class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="users" :size="16" class="text-brand-500" /> {{ t('dashboard.ops.recentEnrollments') }}
        </h3>
        <ul class="space-y-3">
          <li v-for="e in pendaftaranTerbaru" :key="e.id" class="flex items-start gap-3">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-500">
              {{ initialsOf(e.user_nama) }}
            </span>
            <div class="min-w-0">
              <div class="text-sm text-slate-700"><b>{{ e.user_nama }}</b></div>
              <div class="line-clamp-1 text-xs text-slate-400">{{ e.course_judul }} · {{ fmtRelatif(e.created_at) }}</div>
            </div>
          </li>
        </ul>
        <RouterLink to="/d/enrollment" class="section-link mt-3 block text-end">{{ t('dashboard.student.seeAll') }}</RouterLink>
      </div>

      <!-- Antrean payout (direktur/super_admin) -->
      <div v-if="antreanPayout.length" class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="credit-card" :size="16" class="text-brand-500" /> {{ t('dashboard.ops.payoutQueue') }}
        </h3>
        <ul class="space-y-2">
          <li v-for="p in antreanPayout" :key="p.id" class="flex items-center justify-between rounded bg-slate-50 px-3 py-2">
            <span class="text-sm font-medium text-slate-700">{{ fmtRp(p.nominal_total) }}</span>
            <span class="text-xs text-slate-400">{{ fmtRelatif(p.created_at) }}</span>
          </li>
        </ul>
        <RouterLink to="/d/transaksi" class="section-link mt-3 block text-end">{{ t('dashboard.ops.process') }}</RouterLink>
      </div>

      <!-- Audit terbaru (pembina) -->
      <div v-if="auditTerbaru.length" class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="file-text" :size="16" class="text-brand-500" /> {{ t('dashboard.ops.recentAudit') }}
        </h3>
        <ul class="space-y-2">
          <li v-for="a in auditTerbaru.slice(0, 6)" :key="a.id" class="border-s-2 border-slate-200 ps-3">
            <div class="text-sm text-slate-700"><b class="capitalize">{{ a.modul }}</b> · {{ a.aksi }}</div>
            <div class="text-xs text-slate-400">{{ fmtRelatif(a.waktu) }}</div>
          </li>
        </ul>
        <RouterLink to="/d/audit" class="section-link mt-3 block text-end">{{ t('dashboard.student.seeAll') }}</RouterLink>
      </div>

      <!-- Aksi cepat -->
      <div class="card p-5">
        <h3 class="mb-3 card-title">{{ t('dashboard.ops.quickActions') }}</h3>
        <div class="space-y-2">
          <RouterLink v-if="auth.can('pengguna.view')" to="/d/pengguna" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="users" :size="16" /> {{ t('dashboard.ops.quickUsers') }}
          </RouterLink>
          <RouterLink v-if="auth.can('kursus.create')" to="/d/kursus" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="book-open" :size="16" /> {{ t('dashboard.ops.quickCourses') }}
          </RouterLink>
          <RouterLink v-if="auth.can('transaksi.view')" to="/d/transaksi" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="credit-card" :size="16" /> {{ t('dashboard.ops.quickTransactions') }}
          </RouterLink>
          <RouterLink v-if="auth.can('laporan.view')" to="/d/laporan" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="bar-chart" :size="16" /> {{ t('dashboard.ops.quickReports') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
