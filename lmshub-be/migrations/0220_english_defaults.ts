import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * English text for everything the earlier migrations seeded in Indonesian and
 * the interface shows as-is: role names, notification events and templates,
 * badges, the default certificate template, marketing and expense categories,
 * the sample bank account holder, and the (draft) content pages.
 *
 * Each value is only rewritten while it still holds the original seeded text.
 * Anything the site owner already renamed or edited is theirs and is left
 * alone. `down` reverses under the same rule.
 *
 * Codes (`kode`, `jenis_event`, `slug` of a page someone already published) are
 * never touched: permissions, filters and stored references key on them.
 */
type Change = { table: string; keyCol: string; key: string; col: string; id: string; en: string };

const changes: Change[] = [];
const add = (table: string, keyCol: string, key: string, cols: Record<string, [string, string]>) => {
  for (const [col, [id, en]] of Object.entries(cols)) changes.push({ table, keyCol, key, col, id, en });
};

// ── Roles ────────────────────────────────────────────────────────────────
for (const [kode, id, en] of [
  ['direktur', 'Direktur / Manajemen', 'Director / Management'],
  ['ketua', 'Ketua / Pimpinan Lembaga', 'Chairperson / Institution Head'],
  ['pembina', 'Pembina / Pengawas', 'Supervisor / Advisor'],
  ['admin_ops', 'Admin Operasional', 'Operations Admin'],
  ['instructor', 'Instructor / Pengajar', 'Instructor / Teacher'],
  ['asisten', 'Asisten Pengajar (TA)', 'Teaching Assistant (TA)'],
  ['student', 'Student / Peserta', 'Student / Participant'],
  ['sub_user', 'Sub-Pengguna', 'Sub-account'],
]) add('roles', 'kode', kode, { name: [id, en] });

// ── Notification events ─────────────────────────────────────────────────
// [name, description, template_judul, template_isi]
const EVENTS: Array<{ event: string; id: string[]; en: string[] }> = [
  {
    event: 'kelas.tidak_dilanjutkan',
    id: ['Kelas Tidak Dilanjutkan', 'Student tidak aktif belajar N hari', 'Yuk lanjutkan belajarmu', 'Kamu belum melanjutkan course {{course}} selama beberapa hari.'],
    en: ['Course Not Continued', 'Learner has been inactive for N days', 'Pick up where you left off', "You haven't continued {{course}} for a few days."],
  },
  {
    event: 'komisi.cair',
    id: ['Komisi Cair', 'Komisi marketing dicairkan', 'Komisi Anda telah cair', 'Komisi sebesar {{nominal}} telah dicairkan.'],
    en: ['Commission Paid Out', 'Marketing commission paid out', 'Your commission has been paid', 'A commission of {{nominal}} has been paid out.'],
  },
  {
    event: 'live_session.h1',
    id: ['Reminder Live Session H-1', 'Reminder jadwal live H-1/H-1 jam', 'Kelas live akan segera dimulai', 'Sesi {{judul_sesi}} dimulai {{start_time}}.'],
    en: ['Live Session Reminder', 'Reminder 1 day / 1 hour before a live session', 'Your live class starts soon', '{{judul_sesi}} starts {{start_time}}.'],
  },
  {
    event: 'nilai.dirilis',
    id: ['Nilai Dirilis', 'Nilai/feedback tersedia', 'Nilai Anda telah dirilis', 'Nilai untuk {{assessment}} telah tersedia.'],
    en: ['Grade Released', 'Grade or feedback available', 'Your grade has been released', 'Your grade for {{assessment}} is now available.'],
  },
  {
    event: 'order.manual_masuk',
    id: ['Order Manual Masuk', 'Tanda jadi manual diinput marketing', 'Tanda jadi manual masuk', 'Order {{nomor_order}} senilai {{nominal}} diinput manual oleh {{marketing}}.'],
    en: ['Manual Order Recorded', 'Manual payment recorded by marketing', 'Manual payment recorded', 'Order {{nomor_order}} for {{nominal}} was recorded manually by {{marketing}}.'],
  },
  {
    event: 'payment.terverifikasi',
    id: ['Payment Terverifikasi', 'Payment/DP diverifikasi', 'Payment terverifikasi', 'Payment order {{nomor_order}} sebesar {{nominal}} telah diverifikasi.'],
    en: ['Payment Verified', 'Payment or down payment verified', 'Payment verified', 'Payment of {{nominal}} for order {{nomor_order}} has been verified.'],
  },
  {
    event: 'refund.diajukan',
    id: ['Refund Diajukan', 'Butuh approval Direktur', 'Pengajuan refund baru', 'Refund order {{nomor_order}} senilai {{nominal}} menunggu approval.'],
    en: ['Refund Requested', 'Needs director approval', 'New refund request', 'A refund of {{nominal}} for order {{nomor_order}} is awaiting approval.'],
  },
  {
    event: 'certificate.terbit',
    id: ['Certificate Terbit', 'Certificate kelulusan terbit', 'Certificate Anda telah terbit', 'Certificate course {{course}} telah terbit, nomor {{certificate_number}}.'],
    en: ['Certificate Issued', 'Completion certificate issued', 'Your certificate has been issued', 'Your certificate for {{course}} has been issued, number {{certificate_number}}.'],
  },
  {
    event: 'student.mendaftar',
    id: ['Student Baru Mendaftar', 'Student baru mendaftar/checkout', 'Student baru mendaftar', '{{nama_siswa}} mendaftar pada course {{course}}.'],
    en: ['New Learner Enrolled', 'New learner enrolled or checked out', 'New learner enrolled', '{{nama_siswa}} enrolled in {{course}}.'],
  },
  {
    event: 'tagihan.jatuh_tempo',
    id: ['Tagihan Jatuh Tempo', 'Reminder cicilan jatuh tempo', 'Tagihan Anda akan jatuh tempo', 'Cicilan order {{nomor_order}} jatuh tempo {{jatuh_tempo}}.'],
    en: ['Invoice Due', 'Installment due reminder', 'Your invoice is almost due', 'The installment for order {{nomor_order}} is due {{jatuh_tempo}}.'],
  },
  {
    event: 'assignment.dikumpulkan',
    id: ['Assignment Dikumpulkan', 'Submission assignment masuk', 'Assignment baru dikumpulkan', '{{nama_siswa}} mengumpulkan assignment {{assignment}}.'],
    en: ['Assignment Submitted', 'Assignment submission received', 'New assignment submitted', '{{nama_siswa}} submitted {{assignment}}.'],
  },
];
for (const e of EVENTS) {
  add('notification_event_config', 'jenis_event', e.event, {
    name: [e.id[0], e.en[0]],
    description: [e.id[1], e.en[1]],
    template_judul: [e.id[2], e.en[2]],
    template_isi: [e.id[3], e.en[3]],
  });
}

// ── Badges ───────────────────────────────────────────────────────────────
add('badges', 'kode', 'kursus_pertama_selesai', {
  name: ['Course Pertama Selesai', 'First Course Completed'],
  description: ['Menyelesaikan course pertama', 'Completed a first course'],
});
add('badges', 'kode', 'nilai_sempurna', {
  name: ['Nilai Sempurna', 'Perfect Score'],
  description: ['Mendapat skor sempurna pada sebuah quiz', 'Scored 100% on a quiz'],
});
add('badges', 'kode', 'streak_7_hari', {
  name: ['Streak 7 Hari', '7-Day Streak'],
  description: ['Belajar 7 hari beruntun', 'Studied 7 days in a row'],
});

// ── Certificate template ─────────────────────────────────────────────────
add('certificate_templates', 'name', 'Template Standar', {
  description: ['Template certificate bawaan lembaga', "The institution's default certificate template"],
});
add('certificate_templates', 'name', 'Template Standar', { name: ['Template Standar', 'Standard Template'] });

// ── Marketing agent categories ──────────────────────────────────────────
for (const [kode, name, desc] of [
  ['mahasiswa', ['Mahasiswa', 'University Student'], ['Target dasar (entry)', 'Entry-level target']],
  ['umum', ['Umum', 'General'], ['Target menengah', 'Mid-level target']],
  ['profesional', ['Profesional', 'Professional'], ['Target tinggi, agen berpengalaman', 'High target, experienced agents']],
  ['freelance', ['Freelance', 'Freelance'], ['Agen lepas, target menengah-tinggi', 'Freelance agents, mid-to-high target']],
] as Array<[string, [string, string], [string, string]]>) {
  add('marketing_categories', 'kode', kode, { name, description: desc });
}

// ── Finance categories ───────────────────────────────────────────────────
for (const [kode, id, en] of [
  ['penjualan_kursus', 'Penjualan Course', 'Course Sales'],
  ['langganan', 'Langganan/Membership', 'Subscriptions / Membership'],
  ['payout_instruktur', 'Payout Instructor', 'Instructor Payouts'],
  ['komisi_marketing', 'Komisi Marketing', 'Marketing Commission'],
  ['operasional', 'Operasional', 'Operations'],
  ['pemasaran', 'Pemasaran', 'Marketing'],
  ['lainnya', 'Lainnya', 'Other'],
]) add('kategori_biaya', 'kode', kode, { name: [id, en] });

// ── Placeholder bank account holder ─────────────────────────────────────
// A sample account the owner replaces; only its holder name was Indonesian.
add('bank_accounts', 'nomor_rekening', '1234567890', { atas_nama: ['Yayasan LMS Hub', 'LMS Hub Foundation'] });
add('settings', 'key', 'bank.atas_nama', { nilai: ['Yayasan LMS Hub', 'LMS Hub Foundation'] });

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Content pages: title and slug together, and only for a page that is still an
 * untouched draft. The slug is the page's address, so a page the owner has
 * published or written keeps the address they may already have shared.
 */
const PAGES: Array<[string, string, string, string]> = [
  // [old slug, old title, new slug, new title]
  ['tentang-kami', 'Tentang Kami', 'about-us', 'About Us'],
  ['faq', 'Pertanyaan Umum (FAQ)', 'faq', 'Frequently Asked Questions (FAQ)'],
  ['kebijakan-privasi', 'Kebijakan Privasi', 'privacy-policy', 'Privacy Policy'],
  ['syarat-ketentuan', 'Syarat & Ketentuan', 'terms-and-conditions', 'Terms & Conditions'],
];

function rewrite(pgm: MigrationBuilder, dir: 'up' | 'down'): void {
  const list = dir === 'up' ? changes : [...changes].reverse();
  for (const c of list) {
    const [from, to] = dir === 'up' ? [c.id, c.en] : [c.en, c.id];
    // The certificate template has no code and is keyed on its own name, which
    // one of its changes renames — so match either spelling of that name.
    const keyMatch =
      c.table === 'certificate_templates'
        ? `${c.keyCol} IN ('Template Standar', 'Standard Template')`
        : `${c.keyCol} = ${lit(c.key)}`;
    pgm.sql(`
      UPDATE ${c.table} SET ${c.col} = ${lit(to)}, updated_at = now()
       WHERE ${keyMatch} AND ${c.col} = ${lit(from)} AND deleted_at IS NULL;`);
  }
  for (const [oldSlug, oldTitle, newSlug, newTitle] of PAGES) {
    const [fs, ft, ts, tt] = dir === 'up' ? [oldSlug, oldTitle, newSlug, newTitle] : [newSlug, newTitle, oldSlug, oldTitle];
    pgm.sql(`
      UPDATE content_pages SET slug = ${lit(ts)}, title = ${lit(tt)}, updated_at = now()
       WHERE slug = ${lit(fs)} AND title = ${lit(ft)} AND status = 'draft' AND content IS NULL AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM content_pages o WHERE o.slug = ${lit(ts)} AND o.deleted_at IS NULL AND ${lit(fs)} <> ${lit(ts)});`);
  }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  rewrite(pgm, 'up');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  rewrite(pgm, 'down');
}
