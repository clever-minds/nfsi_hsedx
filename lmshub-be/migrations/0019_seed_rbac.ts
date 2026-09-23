/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/** Domain 01 — seed peran, katalog permission, & matriks role_permissions default. */
export const shorthands = undefined;

const ROLES: Array<[string, string, number]> = [
  ['super_admin', 'Super Admin', 0],
  ['direktur', 'Direktur / Manajemen', 1],
  ['ketua', 'Ketua / Pimpinan Lembaga', 2],
  ['pembina', 'Pembina / Pengawas', 3],
  ['admin_ops', 'Admin Operasional', 4],
  ['instruktur', 'Instruktur / Pengajar', 5],
  ['asisten', 'Asisten Pengajar (TA)', 6],
  ['marketing', 'Marketing / Affiliate', 7],
  ['siswa', 'Siswa / Peserta', 8],
  ['sub_user', 'Sub-Pengguna', 9],
];

const MODULES = [
  'konfigurasi', 'pengguna', 'role', 'pengaturan', 'kategori', 'kursus', 'kurikulum', 'konten',
  'enrollment', 'cohort', 'asesmen', 'bank_soal', 'grading', 'gradebook', 'live_class', 'kehadiran',
  'diskusi', 'sertifikat', 'gamifikasi', 'transaksi', 'pembayaran', 'refund', 'marketing', 'komisi',
  'payout', 'laporan', 'keuangan', 'notifikasi', 'dokumen', 'pesan', 'audit',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Roles ──
  for (const [kode, nama, level] of ROLES) {
    pgm.sql(
      `INSERT INTO roles (kode, nama, level, is_system) VALUES ('${kode}', '${nama.replace(/'/g, "''")}', ${level}, true) ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;`,
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
  grant('pembina', `p.action = 'view' AND p.module IN ('pengguna','kursus','enrollment','asesmen','grading','gradebook','transaksi','pembayaran','laporan','keuangan','sertifikat','audit')`);

  // admin_ops: CRUD data operasional; view pada finansial
  grant(
    'admin_ops',
    `(p.module IN ('kategori','kursus','kurikulum','konten','enrollment','cohort','asesmen','bank_soal','grading','gradebook','live_class','kehadiran','diskusi','sertifikat','gamifikasi','notifikasi','dokumen','pesan') AND p.action IN ('view','create','update','delete'))
     OR (p.module IN ('pengguna','marketing','komisi','transaksi','pembayaran') AND p.action IN ('view','create','update'))
     OR (p.module IN ('laporan','keuangan','payout','refund') AND p.action = 'view')`,
  );

  // instruktur: kelola kursus miliknya (row-level di service) + ajar
  grant(
    'instruktur',
    `(p.module IN ('kursus','kurikulum','konten','asesmen','bank_soal','grading','gradebook','live_class','kehadiran','diskusi') AND p.action IN ('view','create','update'))
     OR (p.module IN ('laporan','payout','sertifikat','pengguna','notifikasi','pesan','dokumen') AND p.action = 'view')`,
  );

  // asisten (TA): bantu grading & moderasi
  grant(
    'asisten',
    `(p.module IN ('grading','gradebook','diskusi') AND p.action IN ('view','update'))
     OR (p.module IN ('kursus','asesmen','kehadiran','live_class') AND p.action = 'view')`,
  );

  // marketing/affiliate
  grant(
    'marketing',
    `(p.module IN ('marketing','pesan') AND p.action IN ('view','create','update'))
     OR (p.module = 'transaksi' AND p.action IN ('view','create'))
     OR (p.module IN ('komisi','laporan','pengguna','notifikasi') AND p.action = 'view')`,
  );

  // siswa/peserta
  grant(
    'siswa',
    `(p.module IN ('kursus','enrollment','gradebook','sertifikat','notifikasi','dokumen','kategori') AND p.action = 'view')
     OR (p.module IN ('asesmen','diskusi','pesan') AND p.action IN ('view','create'))
     OR (p.module IN ('transaksi','pembayaran') AND p.action IN ('view','create'))
     OR (p.module IN ('live_class','kehadiran','gamifikasi') AND p.action = 'view')`,
  );

  // sub_user: view terbatas (checklist per orang mempersempit lebih lanjut)
  grant('sub_user', `p.action = 'view' AND p.module IN ('kursus','enrollment','gradebook','sertifikat','notifikasi')`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM role_permissions;`);
  pgm.sql(`DELETE FROM permissions;`);
  pgm.sql(`DELETE FROM roles WHERE is_system = true;`);
}
