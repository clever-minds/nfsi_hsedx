import { query, queryOne } from '../../core/db/pool';

export interface ReminderMendatangRow {
  id: string;
  judul: string;
  jatuh_tempo: string;
  sumber: string;
}

export interface JadwalLiveRow {
  id: string;
  judul: string;
  waktu_mulai: string;
  status: string;
}

export interface PayoutAntreanRow {
  id: string;
  instructor_id: string;
  nominal_total: string;
  status: string;
  created_at: string;
}

export interface AuditTerbaruRow {
  id: string;
  user_id: string | null;
  modul: string;
  aksi: string;
  entity_type: string | null;
  entity_id: string | null;
  waktu: string;
}

const zero = { count: '0' };

async function countOne(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ count: string }>(sql, params);
  return Number(row?.count ?? zero.count);
}

async function sumOne(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ total: string }>(sql, params);
  return Number(row?.total ?? 0);
}

// ── Siswa ────────────────────────────────────────────────────────────────

export async function siswaKpi(userId: string) {
  const [kursusAktif, kursusSelesai, sertifikat, notifikasiBelumDibaca] = await Promise.all([
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1 AND status IN ('terdaftar','aktif') AND deleted_at IS NULL`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1 AND status = 'selesai' AND deleted_at IS NULL`,
      [userId],
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM certificates WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
    countOne(
      `SELECT COUNT(*)::int AS count FROM notification_recipients WHERE user_id = $1 AND status_dibaca = false`,
      [userId],
    ),
  ]);
  return { kursus_aktif: kursusAktif, kursus_selesai: kursusSelesai, sertifikat_diraih: sertifikat, notifikasi_belum_dibaca: notifikasiBelumDibaca };
}

export async function siswaReminderMendatang(userId: string): Promise<ReminderMendatangRow[]> {
  return query<ReminderMendatangRow>(
    `SELECT r.id, r.judul, r.jatuh_tempo, r.sumber
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id AND r.deleted_at IS NULL
      WHERE rt.user_id = $1 AND rt.status_direspons = false AND r.jatuh_tempo >= now()
      ORDER BY r.jatuh_tempo ASC LIMIT 5`,
    [userId],
  );
}

export async function siswaJadwalLiveTerdekat(userId: string): Promise<JadwalLiveRow[]> {
  return query<JadwalLiveRow>(
    `SELECT ls.id, ls.judul, ls.waktu_mulai, ls.status
       FROM live_sessions ls
      WHERE ls.deleted_at IS NULL AND ls.status = 'dijadwalkan' AND ls.waktu_mulai >= now()
        AND (
          EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ls.course_id AND e.user_id = $1 AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))
          OR EXISTS (SELECT 1 FROM cohort_members cm WHERE cm.cohort_id = ls.cohort_id AND cm.user_id = $1)
        )
      ORDER BY ls.waktu_mulai ASC LIMIT 5`,
    [userId],
  );
}

// ── Instruktur ───────────────────────────────────────────────────────────

export async function instrukturKpi(userId: string) {
  const [jumlahKursus, jumlahSiswa, ratingRow, pendapatanBulanIni, payoutPending] = await Promise.all([
    countOne(
      `SELECT COUNT(*)::int AS count FROM courses c
         JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE ip.user_id = $1 AND c.deleted_at IS NULL`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(DISTINCT e.user_id)::int AS count
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE ip.user_id = $1 AND e.deleted_at IS NULL`,
      [userId],
    ),
    queryOne<{ avg: string | null }>(
      `SELECT AVG(rv.rating)::numeric(3,2) AS avg
         FROM reviews rv
         JOIN courses c ON c.id = rv.course_id
         JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE ip.user_id = $1 AND rv.deleted_at IS NULL AND rv.is_hidden = false`,
      [userId],
    ),
    sumOne(
      `SELECT COALESCE(SUM(rs.nominal_share), 0) AS total
         FROM revenue_shares rs
         JOIN instructor_profiles ip ON ip.id = rs.instructor_id
        WHERE ip.user_id = $1 AND date_trunc('month', rs.created_at) = date_trunc('month', now())`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM instructor_payouts ip
         JOIN instructor_profiles p ON p.id = ip.instructor_id
        WHERE p.user_id = $1 AND ip.status <> 'selesai' AND ip.deleted_at IS NULL`,
      [userId],
    ),
  ]);
  return {
    jumlah_kursus: jumlahKursus,
    jumlah_siswa: jumlahSiswa,
    rating_rata_rata: ratingRow?.avg ? Number(ratingRow.avg) : null,
    pendapatan_bulan_ini: pendapatanBulanIni,
    payout_pending: payoutPending,
  };
}

export interface KursusSayaRow {
  id: string;
  judul: string;
  status_publikasi: string;
  jumlah_siswa: number | null;
  rating_avg: string | null;
  harga: string;
}

export interface EnrollmentTerbaruRow {
  id: string;
  user_nama: string;
  course_judul: string;
  status: string;
  created_at: string;
}

/** Kursus milik instruktur, diurutkan berdasarkan jumlah siswa. */
export async function instrukturKursusSaya(userId: string): Promise<KursusSayaRow[]> {
  return query<KursusSayaRow>(
    `SELECT c.id, c.judul, c.status_publikasi, c.jumlah_siswa, c.rating_avg, c.harga
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE ip.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.jumlah_siswa DESC NULLS LAST, c.created_at DESC
      LIMIT 6`,
    [userId],
  );
}

/** Pendaftaran terbaru ke kursus-kursus milik instruktur. */
export async function instrukturEnrollmentTerbaru(userId: string): Promise<EnrollmentTerbaruRow[]> {
  return query<EnrollmentTerbaruRow>(
    `SELECT e.id, u.nama_lengkap AS user_nama, c.judul AS course_judul, e.status, e.created_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
       JOIN users u ON u.id = e.user_id
      WHERE ip.user_id = $1 AND e.deleted_at IS NULL
      ORDER BY e.created_at DESC LIMIT 6`,
    [userId],
  );
}

/** Live session terdekat pada kursus milik instruktur. */
export async function instrukturJadwalLiveTerdekat(userId: string): Promise<JadwalLiveRow[]> {
  return query<JadwalLiveRow>(
    `SELECT ls.id, ls.judul, ls.waktu_mulai, ls.status
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE ip.user_id = $1 AND ls.deleted_at IS NULL AND ls.status = 'dijadwalkan' AND ls.waktu_mulai >= now()
      ORDER BY ls.waktu_mulai ASC LIMIT 5`,
    [userId],
  );
}

// ── Analitik global (admin / direktur / super_admin) ─────────────────────

export interface TrenEnrollmentRow {
  tanggal: string;
  jumlah: number;
}

export interface KursusTerpopulerRow {
  id: string;
  judul: string;
  jumlah_siswa: number | null;
  rating_avg: string | null;
  instructor_nama: string;
}

/** Jumlah pendaftaran per hari, 7 hari terakhir (hari kosong tetap muncul = 0). */
export async function trenEnrollment7Hari(): Promise<TrenEnrollmentRow[]> {
  return query<TrenEnrollmentRow>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS tanggal, COALESCE(cnt.jumlah, 0)::int AS jumlah
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') AS d(day)
       LEFT JOIN (
         SELECT created_at::date AS day, COUNT(*)::int AS jumlah
           FROM enrollments
          WHERE deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY 1
       ) cnt ON cnt.day = d.day::date
      ORDER BY d.day ASC`,
  );
}

export async function kursusTerpopuler(): Promise<KursusTerpopulerRow[]> {
  return query<KursusTerpopulerRow>(
    `SELECT c.id, c.judul, c.jumlah_siswa, c.rating_avg, u.nama_lengkap AS instructor_nama
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
       JOIN users u ON u.id = ip.user_id
      WHERE c.deleted_at IS NULL AND c.status_publikasi IN ('terbit', 'diperbarui')
      ORDER BY c.jumlah_siswa DESC NULLS LAST LIMIT 5`,
  );
}

export async function pendaftaranTerbaruGlobal(): Promise<EnrollmentTerbaruRow[]> {
  return query<EnrollmentTerbaruRow>(
    `SELECT e.id, u.nama_lengkap AS user_nama, c.judul AS course_judul, e.status, e.created_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = e.user_id
      WHERE e.deleted_at IS NULL
      ORDER BY e.created_at DESC LIMIT 6`,
  );
}

export async function globalRingkasan() {
  const [totalPenggunaAktif, totalKursusTerbit, enrollmentBulanIni, pendapatanBulanIni] = await Promise.all([
    countOne(`SELECT COUNT(*)::int AS count FROM users WHERE status = 'active' AND deleted_at IS NULL`),
    countOne(
      `SELECT COUNT(*)::int AS count FROM courses WHERE status_publikasi IN ('terbit','diperbarui') AND deleted_at IS NULL`,
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments
        WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', now())`,
    ),
    sumOne(
      `SELECT COALESCE(SUM(nominal), 0) AS total FROM financial_entries
        WHERE jenis = 'pemasukan' AND deleted_at IS NULL AND date_trunc('month', tanggal) = date_trunc('month', CURRENT_DATE)`,
    ),
  ]);
  return {
    total_pengguna_aktif: totalPenggunaAktif,
    total_kursus_terbit: totalKursusTerbit,
    enrollment_bulan_ini: enrollmentBulanIni,
    pendapatan_bulan_ini: pendapatanBulanIni,
  };
}

// ── Analitik lintas peran (dipakai dashboard admin & direktur) ───────────

export interface KomposisiRow {
  status: string;
  jumlah: number;
}

/**
 * Sebaran order per status — bagian-terhadap-keseluruhan untuk donut.
 * Status yang nol tetap dikembalikan agar donut tidak berubah-ubah
 * segmennya tiap kali ada order baru.
 */
export async function komposisiOrder(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT s.status, COALESCE(o.jumlah, 0)::int AS jumlah
       FROM unnest(enum_range(NULL::order_status)) AS s(status)
       LEFT JOIN (
         SELECT status, COUNT(*)::int AS jumlah
           FROM orders WHERE deleted_at IS NULL GROUP BY status
       ) o ON o.status = s.status
      ORDER BY jumlah DESC, s.status`,
  );
}

/** Sebaran enrollment per status — pasangan donut kedua. */
export async function komposisiEnrollment(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT s.status, COALESCE(e.jumlah, 0)::int AS jumlah
       FROM unnest(enum_range(NULL::enrollment_status)) AS s(status)
       LEFT JOIN (
         SELECT status, COUNT(*)::int AS jumlah
           FROM enrollments WHERE deleted_at IS NULL GROUP BY status
       ) e ON e.status = s.status
      ORDER BY jumlah DESC, s.status`,
  );
}

/**
 * Sebaran pengguna aktif per peran. Semua peran dikembalikan termasuk yang nol,
 * sama seperti komposisi lain, supaya pemanggil memutuskan sendiri mana yang
 * ditampilkan tanpa perlu tahu daftar peran yang ada.
 */
export async function komposisiPeran(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT r.kode AS status, COUNT(u.id)::int AS jumlah
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      GROUP BY r.kode
      ORDER BY jumlah DESC, r.kode`,
  );
}

export interface TopInstrukturRow {
  id: string;
  nama: string;
  foto_profil: string | null;
  jumlah_kursus: number;
  total_siswa: number;
  rating_avg: string | null;
}

/**
 * Instruktur dengan siswa terbanyak. `total_siswa` dihitung ulang dari kursus
 * terbit alih-alih memakai kolom denormalisasi di instructor_profiles, supaya
 * angkanya konsisten dengan yang tampil di daftar kursus.
 */
export async function topInstruktur(): Promise<TopInstrukturRow[]> {
  return query<TopInstrukturRow>(
    `SELECT ip.id,
            u.nama_lengkap AS nama,
            u.foto_profil,
            COUNT(c.id)::int AS jumlah_kursus,
            COALESCE(SUM(c.jumlah_siswa), 0)::int AS total_siswa,
            ip.rating_avg
       FROM instructor_profiles ip
       JOIN users u ON u.id = ip.user_id
       LEFT JOIN courses c
         ON c.instructor_id = ip.id
        AND c.deleted_at IS NULL
        AND c.status_publikasi IN ('terbit', 'diperbarui')
      WHERE ip.deleted_at IS NULL AND u.deleted_at IS NULL
      GROUP BY ip.id, u.nama_lengkap, u.foto_profil, ip.rating_avg
      HAVING COUNT(c.id) > 0
      ORDER BY total_siswa DESC, ip.rating_avg DESC NULLS LAST
      LIMIT 5`,
  );
}

export interface TransaksiTerbaruRow {
  id: string;
  pembeli_nama: string;
  jalur: string;
  status: string;
  total: string;
  created_at: string;
}

/** Order terbaru lintas pembeli — kolom "Transaksi Baru" di dashboard. */
export async function transaksiTerbaru(): Promise<TransaksiTerbaruRow[]> {
  return query<TransaksiTerbaruRow>(
    `SELECT o.id, u.nama_lengkap AS pembeli_nama, o.jalur::text, o.status::text, o.total, o.created_at
       FROM orders o
       JOIN users u ON u.id = o.buyer_user_id
      WHERE o.deleted_at IS NULL
      ORDER BY o.created_at DESC
      LIMIT 6`,
  );
}

// ── Admin Ops ────────────────────────────────────────────────────────────

export async function adminKpi() {
  const [antreanVerifikasiPembayaran, pendaftaranBaru, jadwalLiveHariIni, refundPending] = await Promise.all([
    countOne(`SELECT COUNT(*)::int AS count FROM payments WHERE status = 'menunggu_verifikasi'`),
    countOne(`SELECT COUNT(*)::int AS count FROM users WHERE status = 'pending' AND deleted_at IS NULL`),
    countOne(
      `SELECT COUNT(*)::int AS count FROM live_sessions WHERE deleted_at IS NULL AND waktu_mulai::date = CURRENT_DATE`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM refunds WHERE status = 'diajukan'`),
  ]);
  return {
    antrean_verifikasi_pembayaran: antreanVerifikasiPembayaran,
    pendaftaran_baru: pendaftaranBaru,
    jadwal_live_hari_ini: jadwalLiveHariIni,
    refund_pending: refundPending,
  };
}

// ── Direktur ─────────────────────────────────────────────────────────────

export async function direkturKpi() {
  const [pemasukan, pengeluaran, payoutMenunggu, komisiMenunggu, refundMenunggu] = await Promise.all([
    sumOne(
      `SELECT COALESCE(SUM(nominal), 0) AS total FROM financial_entries
        WHERE jenis = 'pemasukan' AND deleted_at IS NULL AND date_trunc('month', tanggal) = date_trunc('month', CURRENT_DATE)`,
    ),
    sumOne(
      `SELECT COALESCE(SUM(nominal), 0) AS total FROM financial_entries
        WHERE jenis = 'pengeluaran' AND deleted_at IS NULL AND date_trunc('month', tanggal) = date_trunc('month', CURRENT_DATE)`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM instructor_payouts WHERE status = 'menunggu_approval' AND deleted_at IS NULL`),
    countOne(`SELECT COUNT(*)::int AS count FROM commissions WHERE status = 'dihitung'`),
    countOne(`SELECT COUNT(*)::int AS count FROM refunds WHERE status = 'diajukan'`),
  ]);
  return {
    revenue_bulan_ini: pemasukan,
    pengeluaran_bulan_ini: pengeluaran,
    laba_bulan_ini: pemasukan - pengeluaran,
    antrean_approval: {
      payout: payoutMenunggu,
      komisi: komisiMenunggu,
      refund: refundMenunggu,
    },
  };
}

export async function direkturAntreanPayout(): Promise<PayoutAntreanRow[]> {
  return query<PayoutAntreanRow>(
    `SELECT id, instructor_id, total_nominal AS nominal_total, status, created_at FROM instructor_payouts
      WHERE status = 'menunggu_approval' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 10`,
  );
}

// ── Ketua ────────────────────────────────────────────────────────────────

export async function ketuaKpi() {
  const [totalSiswaAktif, totalKursusAktif, ratingRow] = await Promise.all([
    countOne(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM enrollments WHERE status IN ('terdaftar','aktif') AND deleted_at IS NULL`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM courses WHERE status_publikasi = 'terbit' AND deleted_at IS NULL`),
    queryOne<{ avg: string | null }>(
      `SELECT AVG(rating)::numeric(3,2) AS avg FROM reviews WHERE deleted_at IS NULL AND is_hidden = false`,
    ),
  ]);
  return {
    total_siswa_aktif: totalSiswaAktif,
    total_kursus_aktif: totalKursusAktif,
    rating_rata_rata_platform: ratingRow?.avg ? Number(ratingRow.avg) : null,
  };
}

// ── Pembina ──────────────────────────────────────────────────────────────

export async function pembinaKpi() {
  const [payoutMenunggu, verifikasiPembayaranMenunggu] = await Promise.all([
    countOne(`SELECT COUNT(*)::int AS count FROM instructor_payouts WHERE status = 'menunggu_approval' AND deleted_at IS NULL`),
    countOne(`SELECT COUNT(*)::int AS count FROM payments WHERE status = 'menunggu_verifikasi'`),
  ]);
  return { payout_menunggu_approval: payoutMenunggu, verifikasi_pembayaran_menunggu: verifikasiPembayaranMenunggu };
}

export async function pembinaAuditTerbaru(): Promise<AuditTerbaruRow[]> {
  return query<AuditTerbaruRow>(
    `SELECT id, user_id, module AS modul, action AS aksi, entity AS entity_type, entity_id, created_at AS waktu FROM audit_log
      ORDER BY created_at DESC LIMIT 10`,
  );
}

// ── Marketing ────────────────────────────────────────────────────────────

export async function marketingKpi(userId: string) {
  const [komisiBulanIni, komisiPending, jumlahReferral, leadsAktif] = await Promise.all([
    sumOne(
      `SELECT COALESCE(SUM(nominal), 0) AS total FROM commissions
        WHERE agen_user_id = $1 AND status = 'selesai' AND date_trunc('month', created_at) = date_trunc('month', now())`,
      [userId],
    ),
    sumOne(`SELECT COALESCE(SUM(nominal), 0) AS total FROM commissions WHERE agen_user_id = $1 AND status = 'dihitung'`, [userId]),
    countOne(
      `SELECT COUNT(*)::int AS count FROM referral_links rl
        WHERE rl.agen_user_id = $1 AND rl.deleted_at IS NULL`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM leads l
        WHERE l.agen_user_id = $1 AND l.tahap IN ('lead','prospek') AND l.deleted_at IS NULL`,
      [userId],
    ),
  ]);
  return {
    komisi_bulan_ini: komisiBulanIni,
    komisi_pending: komisiPending,
    jumlah_referral_link: jumlahReferral,
    leads_pipeline_aktif: leadsAktif,
  };
}
