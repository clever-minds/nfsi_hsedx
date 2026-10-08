/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/** Domain 01 — seed peran, catalog permission, & matriks role_permissions default. */
export const shorthands = undefined;

const ROLES: Array<[string, string, number]> = [
  ['super_admin', 'Super Admin', 0],
  ['direktur', 'Direktur / Manajemen', 1],
  ['ketua', 'Ketua / Pimpinan Lembaga', 2],
  ['pembina', 'Pembina / Pengawas', 3],
  ['admin_ops', 'Admin Operasional', 4],
  ['instructor', 'Instructor / Pengajar', 5],
  ['asisten', 'Asisten Pengajar (TA)', 6],
  ['marketing', 'Marketing / Affiliate', 7],
  ['student', 'Student / Peserta', 8],
  ['sub_user', 'Sub-Pengguna', 9],
];

const MODULES = [
  'konfigurasi', 'pengguna', 'role', 'pengaturan', 'kategori', 'course', 'kurikulum', 'content',
  'enrollment', 'cohort', 'assessment', 'bank_soal', 'grading', 'gradebook', 'live_class', 'kehadiran',
  'diskusi', 'certificate', 'gamifikasi', 'transaction', 'payment', 'refund', 'marketing', 'komisi',
  'payout', 'laporan', 'keuangan', 'notifikasi', 'document', 'pesan', 'audit',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Roles ──
  for (const [kode, name, level] of ROLES) {
    pgm.sql(
      `INSERT INTO roles (kode, name, level, is_system) VALUES ('${kode}', '${name.replace(/'/g, "''")}', ${level}, true) ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;`,
    );
  }

  // ── Permissions (module × action; audit hanya view) ──
  for (const m of MODULES) {
    const actions = m === 'audit' ? ['view'] : ['view', 'create', 'update', 'delete'];
    for (const a of actions) {
      pgm.sql(
        `INSERT INTO permissions (module, action) VALUES ('${m}', '${a}') ON CONFLICT (module, action) WHERE deleted_at IS NULL DO NOTHING;`,
      );
    }
  }

  // ── Matriks role_permissions default ──
  const grant = (roleKode: string, whereClause: string) =>
    pgm.sql(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.kode = '${roleKode}' AND (${whereClause})
      ON CONFLICT (role_id, permission_id) DO NOTHING;`);

  // super_admin: semua (walau kode juga memberi wildcard)
  grant('super_admin', `true`);

  // direktur: operasional penuh (view+create+update) semua modul kecuali konfigurasi; approve via update; audit view
  grant(
    'direktur',
    `(p.action IN ('view','create','update') AND p.module <> 'konfigurasi') OR (p.module='audit')`,
  );

  // ketua: baca menyeluruh + laporan/audit view
  grant('ketua', `p.action = 'view' AND p.module <> 'konfigurasi'`);

  // pembina: baca + audit (pengawas)
  grant('pembina', `p.action = 'view' AND p.module IN ('pengguna','course','enrollment','assessment','grading','gradebook','transaction','payment','laporan','keuangan','certificate','audit')`);

  // admin_ops: CRUD data operasional; view pada finansial
  grant(
    'admin_ops',
    `(p.module IN ('kategori','course','kurikulum','content','enrollment','cohort','assessment','bank_soal','grading','gradebook','live_class','kehadiran','diskusi','certificate','gamifikasi','notifikasi','document','pesan') AND p.action IN ('view','create','update','delete'))
     OR (p.module IN ('pengguna','marketing','komisi','transaction','payment') AND p.action IN ('view','create','update'))
     OR (p.module IN ('laporan','keuangan','payout','refund') AND p.action = 'view')`,
  );

  // instructor: kelola course miliknya (row-level di service) + ajar
  grant(
    'instructor',
    `(p.module IN ('course','kurikulum','content','assessment','bank_soal','grading','gradebook','live_class','kehadiran','diskusi') AND p.action IN ('view','create','update'))
     OR (p.module IN ('laporan','payout','certificate','pengguna','notifikasi','pesan','document') AND p.action = 'view')`,
  );

  // asisten (TA): bantu grading & moderasi
  grant(
    'asisten',
    `(p.module IN ('grading','gradebook','diskusi') AND p.action IN ('view','update'))
     OR (p.module IN ('course','assessment','kehadiran','live_class') AND p.action = 'view')`,
  );

  // marketing/affiliate
  grant(
    'marketing',
    `(p.module IN ('marketing','pesan') AND p.action IN ('view','create','update'))
     OR (p.module = 'transaction' AND p.action IN ('view','create'))
     OR (p.module IN ('komisi','laporan','pengguna','notifikasi') AND p.action = 'view')`,
  );

  // student/peserta
  grant(
    'student',
    `(p.module IN ('course','enrollment','gradebook','certificate','notifikasi','document','kategori') AND p.action = 'view')
     OR (p.module IN ('assessment','diskusi','pesan') AND p.action IN ('view','create'))
     OR (p.module IN ('transaction','payment') AND p.action IN ('view','create'))
     OR (p.module IN ('live_class','kehadiran','gamifikasi') AND p.action = 'view')`,
  );

  // sub_user: view terbatas (checklist per orang mempersempit lebih lanjut)
  grant('sub_user', `p.action = 'view' AND p.module IN ('course','enrollment','gradebook','certificate','notifikasi')`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM role_permissions;`);
  pgm.sql(`DELETE FROM permissions;`);
  pgm.sql(`DELETE FROM roles WHERE is_system = true;`);
}
