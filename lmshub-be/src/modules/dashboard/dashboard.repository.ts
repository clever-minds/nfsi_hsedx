import { query, queryOne } from '../../core/db/pool';

export interface ReminderMendatangRow {
  id: string;
  title: string;
  due_date: string;
  source: string;
}

export interface JadwalLiveRow {
  id: string;
  title: string;
  start_time: string;
  status: string;
}

export interface PayoutAntreanRow {
  id: string;
  instructor_id: string;
  amount_total: string;
  status: string;
  created_at: string;
}

export interface AuditTerbaruRow {
  id: string;
  user_id: string | null;
  modul: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  time: string;
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

// ── Student ────────────────────────────────────────────────────────────────

export async function siswaKpi(userId: string) {
  const [kursusAktif, kursusSelesai, certificate, notifikasiBelumDibaca] = await Promise.all([
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1 AND status IN ('registered','active') AND deleted_at IS NULL`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL`,
      [userId],
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM certificates WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
    countOne(
      `SELECT COUNT(*)::int AS count FROM notification_recipients WHERE user_id = $1 AND is_read = false`,
      [userId],
    ),
  ]);
  return { kursus_aktif: kursusAktif, kursus_finish: kursusSelesai, sertifikat_diraih: certificate, notification_belum_read: notifikasiBelumDibaca };
}

export async function siswaReminderMendatang(userId: string): Promise<ReminderMendatangRow[]> {
  return query<ReminderMendatangRow>(
    `SELECT r.id, r.title, r.due_date, r.source
       FROM reminder_tracking rt
       JOIN reminders r ON r.id = rt.reminder_id AND r.deleted_at IS NULL
      WHERE rt.user_id = $1 AND rt.is_responded = false AND r.due_date >= now()
      ORDER BY r.due_date ASC LIMIT 5`,
    [userId],
  );
}

export async function siswaJadwalLiveTerdekat(userId: string): Promise<JadwalLiveRow[]> {
  return query<JadwalLiveRow>(
    `SELECT ls.id, ls.title, ls.start_time, ls.status
       FROM live_sessions ls
      WHERE ls.deleted_at IS NULL AND ls.status = 'scheduled' AND ls.start_time >= now()
        AND (
          EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ls.course_id AND e.user_id = $1 AND e.deleted_at IS NULL AND e.status IN ('registered','active'))
          OR EXISTS (SELECT 1 FROM cohort_members cm WHERE cm.cohort_id = ls.cohort_id AND cm.user_id = $1)
        )
      ORDER BY ls.start_time ASC LIMIT 5`,
    [userId],
  );
}

// ── Instructor ───────────────────────────────────────────────────────────

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
      `SELECT COALESCE(SUM(rs.amount_share), 0) AS total
         FROM revenue_shares rs
         JOIN instructor_profiles ip ON ip.id = rs.instructor_id
        WHERE ip.user_id = $1 AND date_trunc('month', rs.created_at) = date_trunc('month', now())`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM instructor_payouts ip
         JOIN instructor_profiles p ON p.id = ip.instructor_id
        WHERE p.user_id = $1 AND ip.status <> 'completed' AND ip.deleted_at IS NULL`,
      [userId],
    ),
  ]);
  return {
    amount_kursus: jumlahKursus,
    student_count: jumlahSiswa,
    rating_rata_rata: ratingRow?.avg ? Number(ratingRow.avg) : null,
    pendapatan_month_ini: pendapatanBulanIni,
    payout_pending: payoutPending,
  };
}

export interface KursusSayaRow {
  id: string;
  title: string;
  publication_status: string;
  student_count: number | null;
  rating_avg: string | null;
  price: string;
}

export interface EnrollmentTerbaruRow {
  id: string;
  user_name: string;
  course_title: string;
  status: string;
  created_at: string;
}

/** Course milik instructor, disort_orderkan berdasarkan amount student. */
export async function instrukturKursusSaya(userId: string): Promise<KursusSayaRow[]> {
  return query<KursusSayaRow>(
    `SELECT c.id, c.title, c.publication_status, c.student_count, c.rating_avg, c.price
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE ip.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.student_count DESC NULLS LAST, c.created_at DESC
      LIMIT 6`,
    [userId],
  );
}

/** Pendaftaran terbaru to course-course milik instructor. */
export async function instrukturEnrollmentTerbaru(userId: string): Promise<EnrollmentTerbaruRow[]> {
  return query<EnrollmentTerbaruRow>(
    `SELECT e.id, u.name_lengkap AS user_name, c.title AS course_title, e.status, e.created_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
       JOIN users u ON u.id = e.user_id
      WHERE ip.user_id = $1 AND e.deleted_at IS NULL
      ORDER BY e.created_at DESC LIMIT 6`,
    [userId],
  );
}

/** Live session terdekat pada course milik instructor. */
export async function instrukturJadwalLiveTerdekat(userId: string): Promise<JadwalLiveRow[]> {
  return query<JadwalLiveRow>(
    `SELECT ls.id, ls.title, ls.start_time, ls.status
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE ip.user_id = $1 AND ls.deleted_at IS NULL AND ls.status = 'scheduled' AND ls.start_time >= now()
      ORDER BY ls.start_time ASC LIMIT 5`,
    [userId],
  );
}

// ── Analitik global (admin / direktur / super_admin) ─────────────────────

export interface TrenEnrollmentRow {
  date: string;
  amount: number;
}

export interface KursusTerpopulerRow {
  id: string;
  title: string;
  student_count: number | null;
  rating_avg: string | null;
  instructor_name: string;
}

/** Jumlah pendaftaran per hari, 7 hari terakhir (hari kosong tetap muncul = 0). */
export async function trenEnrollment7Hari(): Promise<TrenEnrollmentRow[]> {
  return query<TrenEnrollmentRow>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(cnt.amount, 0)::int AS amount
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') AS d(day)
       LEFT JOIN (
         SELECT created_at::date AS day, COUNT(*)::int AS amount
           FROM enrollments
          WHERE deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY 1
       ) cnt ON cnt.day = d.day::date
      ORDER BY d.day ASC`,
  );
}

export async function kursusTerpopuler(): Promise<KursusTerpopulerRow[]> {
  return query<KursusTerpopulerRow>(
    `SELECT c.id, c.title, c.student_count, c.rating_avg, u.name_lengkap AS instructor_name
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
       JOIN users u ON u.id = ip.user_id
      WHERE c.deleted_at IS NULL AND c.publication_status IN ('publish', 'updated')
      ORDER BY c.student_count DESC NULLS LAST LIMIT 5`,
  );
}

export async function pendaftaranTerbaruGlobal(): Promise<EnrollmentTerbaruRow[]> {
  return query<EnrollmentTerbaruRow>(
    `SELECT e.id, u.name_lengkap AS user_name, c.title AS course_title, e.status, e.created_at
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
      `SELECT COUNT(*)::int AS count FROM courses WHERE publication_status IN ('publish','updated') AND deleted_at IS NULL`,
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM enrollments
        WHERE deleted_at IS NULL AND date_trunc('month', created_at) = date_trunc('month', now())`,
    ),
    sumOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_entries
        WHERE type = 'income' AND deleted_at IS NULL AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`,
    ),
  ]);
  return {
    total_pengguna_aktif: totalPenggunaAktif,
    total_kursus_publish: totalKursusTerbit,
    enrollment_month_ini: enrollmentBulanIni,
    pendapatan_month_ini: pendapatanBulanIni,
  };
}

// ── Analitik lintas peran (dipakai dashboard admin & direktur) ───────────

export interface KomposisiRow {
  status: string;
  amount: number;
}

/**
 * Sebaran order per status — bagian-terhadap-keseluruhan untuk donut.
 * Status yang nol tetap dikembalikan agar donut no berubah-edit
 * segmentnya tiap kali ada order baru.
 */
export async function komposisiOrder(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT s.status, COALESCE(o.amount, 0)::int AS amount
       FROM unnest(enum_range(NULL::order_status)) AS s(status)
       LEFT JOIN (
         SELECT status, COUNT(*)::int AS amount
           FROM orders WHERE deleted_at IS NULL GROUP BY status
       ) o ON o.status = s.status
      ORDER BY amount DESC, s.status`,
  );
}

/** Sebaran enrollment per status — pasangan donut kedua. */
export async function komposisiEnrollment(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT s.status, COALESCE(e.amount, 0)::int AS amount
       FROM unnest(enum_range(NULL::enrollment_status)) AS s(status)
       LEFT JOIN (
         SELECT status, COUNT(*)::int AS amount
           FROM enrollments WHERE deleted_at IS NULL GROUP BY status
       ) e ON e.status = s.status
      ORDER BY amount DESC, s.status`,
  );
}

/**
 * Sebaran user active per peran. Semua peran dikembalikan termasuk yang nol,
 * sama seperti komposisi lain, supaya pemanggil memutuskan sendiri mana yang
 * ditampilkan tanpa perlu tahu register peran yang ada.
 */
export async function komposisiPeran(): Promise<KomposisiRow[]> {
  return query<KomposisiRow>(
    `SELECT r.kode AS status, COUNT(u.id)::int AS amount
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      GROUP BY r.kode
      ORDER BY amount DESC, r.kode`,
  );
}

export interface TopInstrukturRow {
  id: string;
  name: string;
  profile_picture: string | null;
  amount_kursus: number;
  total_siswa: number;
  rating_avg: string | null;
}

/**
 * Instructor dengan student terbanyak. `total_siswa` dihitung ulang from course
 * publish alih-alih memakai kolom denormalisasi di instructor_profiles, supaya
 * angkanya konsisten dengan yang tampil di register course.
 */
export async function topInstruktur(): Promise<TopInstrukturRow[]> {
  return query<TopInstrukturRow>(
    `SELECT ip.id,
            u.name_lengkap AS name,
            u.profile_picture,
            COUNT(c.id)::int AS amount_kursus,
            COALESCE(SUM(c.student_count), 0)::int AS total_siswa,
            ip.rating_avg
       FROM instructor_profiles ip
       JOIN users u ON u.id = ip.user_id
       LEFT JOIN courses c
         ON c.instructor_id = ip.id
        AND c.deleted_at IS NULL
        AND c.publication_status IN ('publish', 'updated')
      WHERE ip.deleted_at IS NULL AND u.deleted_at IS NULL
      GROUP BY ip.id, u.name_lengkap, u.profile_picture, ip.rating_avg
      HAVING COUNT(c.id) > 0
      ORDER BY total_siswa DESC, ip.rating_avg DESC NULLS LAST
      LIMIT 5`,
  );
}

export interface TransaksiTerbaruRow {
  id: string;
  pembeli_name: string;
  channel: string;
  status: string;
  total: string;
  created_at: string;
}

/** Order terbaru lintas pembeli — kolom "Transaction Baru" di dashboard. */
export async function transaksiTerbaru(): Promise<TransaksiTerbaruRow[]> {
  return query<TransaksiTerbaruRow>(
    `SELECT o.id, u.name_lengkap AS pembeli_name, o.channel::text, o.status::text, o.total, o.created_at
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
    countOne(`SELECT COUNT(*)::int AS count FROM payments WHERE status = 'awaiting_verification'`),
    countOne(`SELECT COUNT(*)::int AS count FROM users WHERE status = 'pending' AND deleted_at IS NULL`),
    countOne(
      `SELECT COUNT(*)::int AS count FROM live_sessions WHERE deleted_at IS NULL AND start_time::date = CURRENT_DATE`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM refunds WHERE status = 'submitted'`),
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
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_entries
        WHERE type = 'income' AND deleted_at IS NULL AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`,
    ),
    sumOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_entries
        WHERE type = 'expense' AND deleted_at IS NULL AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM instructor_payouts WHERE status = 'awaiting_approval' AND deleted_at IS NULL`),
    countOne(`SELECT COUNT(*)::int AS count FROM commissions WHERE status = 'calculated'`),
    countOne(`SELECT COUNT(*)::int AS count FROM refunds WHERE status = 'submitted'`),
  ]);
  return {
    revenue_month_ini: pemasukan,
    pengeluaran_month_ini: pengeluaran,
    laba_month_ini: pemasukan - pengeluaran,
    antrean_approval: {
      payout: payoutMenunggu,
      commission: komisiMenunggu,
      refund: refundMenunggu,
    },
  };
}

export async function direkturAntreanPayout(): Promise<PayoutAntreanRow[]> {
  return query<PayoutAntreanRow>(
    `SELECT id, instructor_id, total_amount AS amount_total, status, created_at FROM instructor_payouts
      WHERE status = 'awaiting_approval' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 10`,
  );
}

// ── Ketua ────────────────────────────────────────────────────────────────

export async function ketuaKpi() {
  const [totalSiswaAktif, totalKursusAktif, ratingRow] = await Promise.all([
    countOne(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM enrollments WHERE status IN ('registered','active') AND deleted_at IS NULL`,
    ),
    countOne(`SELECT COUNT(*)::int AS count FROM courses WHERE publication_status = 'publish' AND deleted_at IS NULL`),
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
    countOne(`SELECT COUNT(*)::int AS count FROM instructor_payouts WHERE status = 'awaiting_approval' AND deleted_at IS NULL`),
    countOne(`SELECT COUNT(*)::int AS count FROM payments WHERE status = 'awaiting_verification'`),
  ]);
  return { payout_menunggu_approval: payoutMenunggu, verifikasi_pembayaran_menunggu: verifikasiPembayaranMenunggu };
}

export async function pembinaAuditTerbaru(): Promise<AuditTerbaruRow[]> {
  return query<AuditTerbaruRow>(
    `SELECT id, user_id, module AS modul, action AS action, entity AS entity_type, entity_id, created_at AS time FROM audit_log
      ORDER BY created_at DESC LIMIT 10`,
  );
}

// ── Marketing ────────────────────────────────────────────────────────────

export async function marketingKpi(userId: string) {
  const [komisiBulanIni, komisiPending, jumlahReferral, leadsAktif] = await Promise.all([
    sumOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM commissions
        WHERE agent_user_id = $1 AND status = 'completed' AND date_trunc('month', created_at) = date_trunc('month', now())`,
      [userId],
    ),
    sumOne(`SELECT COALESCE(SUM(amount), 0) AS total FROM commissions WHERE agent_user_id = $1 AND status = 'calculated'`, [userId]),
    countOne(
      `SELECT COUNT(*)::int AS count FROM referral_links rl
        WHERE rl.agent_user_id = $1 AND rl.deleted_at IS NULL`,
      [userId],
    ),
    countOne(
      `SELECT COUNT(*)::int AS count FROM leads l
        WHERE l.agent_user_id = $1 AND l.stage IN ('lead','prospect') AND l.deleted_at IS NULL`,
      [userId],
    ),
  ]);
  return {
    commission_month_ini: komisiBulanIni,
    commission_pending: komisiPending,
    amount_referral_link: jumlahReferral,
    leads_pipeline_aktif: leadsAktif,
  };
}
