/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/** Domain 01 — seed peran, catalog permission, & matriks role_permissions default. */
export const shorthands = undefined;

const ROLES: Array<[string, string, number]> = [
  ['super_admin', 'Super Admin', 0],
  ['director', 'Director / Management', 1],
  ['chairperson', 'Chairperson / Institution Head', 2],
  ['supervisor', 'Supervisor / Advisor', 3],
  ['operations_admin', 'Operations Admin', 4],
  ['instructor', 'Instructor', 5],
  ['assistant', 'Teaching Assistant', 6],
  ['marketing', 'Marketing / Affiliate', 7],
  ['student', 'Student', 8],
  ['sub_user', 'Sub-account', 9],
];

const MODULES = [
  'configuration', 'users', 'role', 'settings', 'category', 'course', 'curriculum', 'content',
  'enrollment', 'cohort', 'assessment', 'question_bank', 'grading', 'gradebook', 'live_class', 'attendance',
  'discussion', 'certificate', 'gamification', 'transaction', 'payment', 'refund', 'marketing', 'commission',
  'payout', 'report', 'finance', 'notification', 'document', 'messages', 'audit',
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
    'director',
    `(p.action IN ('view','create','update') AND p.module <> 'configuration') OR (p.module='audit')`,
  );

  // ketua: baca menyeluruh + report/audit view
  grant('chairperson', `p.action = 'view' AND p.module <> 'configuration'`);

  // pembina: baca + audit (pengawas)
  grant('supervisor', `p.action = 'view' AND p.module IN ('users','course','enrollment','assessment','grading','gradebook','transaction','payment','report','finance','certificate','audit')`);

  // admin_ops: CRUD data operasional; view pada finansial
  grant(
    'operations_admin',
    `(p.module IN ('category','course','curriculum','content','enrollment','cohort','assessment','question_bank','grading','gradebook','live_class','attendance','discussion','certificate','gamification','notification','document','messages') AND p.action IN ('view','create','update','delete'))
     OR (p.module IN ('users','marketing','commission','transaction','payment') AND p.action IN ('view','create','update'))
     OR (p.module IN ('report','finance','payout','refund') AND p.action = 'view')`,
  );

  // instructor: kelola course miliknya (row-level di service) + ajar
  grant(
    'instructor',
    `(p.module IN ('course','curriculum','content','assessment','question_bank','grading','gradebook','live_class','attendance','discussion') AND p.action IN ('view','create','update'))
     OR (p.module IN ('report','payout','certificate','users','notification','messages','document') AND p.action = 'view')`,
  );

  // asisten (TA): bantu grading & moderasi
  grant(
    'assistant',
    `(p.module IN ('grading','gradebook','discussion') AND p.action IN ('view','update'))
     OR (p.module IN ('course','assessment','attendance','live_class') AND p.action = 'view')`,
  );

  // marketing/affiliate
  grant(
    'marketing',
    `(p.module IN ('marketing','messages') AND p.action IN ('view','create','update'))
     OR (p.module = 'transaction' AND p.action IN ('view','create'))
     OR (p.module IN ('commission','report','users','notification') AND p.action = 'view')`,
  );

  // student/peserta
  grant(
    'student',
    `(p.module IN ('course','enrollment','gradebook','certificate','notification','document','category') AND p.action = 'view')
     OR (p.module IN ('assessment','discussion','messages') AND p.action IN ('view','create'))
     OR (p.module IN ('transaction','payment') AND p.action IN ('view','create'))
     OR (p.module IN ('live_class','attendance','gamification') AND p.action = 'view')`,
  );

  // sub_user: view terbatas (checklist per orang mempersempit lebih lanjut)
  grant('sub_user', `p.action = 'view' AND p.module IN ('course','enrollment','gradebook','certificate','notification')`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM role_permissions;`);
  pgm.sql(`DELETE FROM permissions;`);
  pgm.sql(`DELETE FROM roles WHERE is_system = true;`);
}
