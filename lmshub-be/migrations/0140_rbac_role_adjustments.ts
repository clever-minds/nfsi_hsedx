import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Penyesuaian matriks role_permissions (lanjutan audit peran):
 * C. admin_ops — beri `settings` view+update. "Admin Operasional" perlu mengakses
 * menu settings; previous modul 'settings' tak ada di grant admin_ops.
 * D. instructor & asisten — beri `enrollment.view` saja. Instructor/asisten perlu melihat
 * peserta kursusnya; service membatasi row-level via isInstructorScoped. Sengaja no
 * memberi `cohort.view` karena endpointst GET /cohorts no di-scope per-instructor
 * (akan membocorkan semua cohort lintas course). action kelola (create/update) tetap
 * no diberikan, jadi mereka read-only pada tab Enrollment.
 */

const GRANTS: Array<{ role: string; module: string; action: string }> = [
  // C — admin_ops akses settings
  { role: 'operations_admin', module: 'settings', action: 'view' },
  { role: 'operations_admin', module: 'settings', action: 'update' },
  // D — instructor & asisten view peserta kursusnya (read-only, row-scoped di service)
  { role: 'instructor', module: 'enrollment', action: 'view' },
  { role: 'assistant', module: 'enrollment', action: 'view' },
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const g of GRANTS) {
    pgm.sql(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
        FROM roles r, permissions p
       WHERE r.kode = '${g.role}'
         AND p.module = '${g.module}' AND p.action = '${g.action}'
      ON CONFLICT DO NOTHING;
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const g of GRANTS) {
    pgm.sql(`
      DELETE FROM role_permissions rp
       USING roles r, permissions p
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
         AND r.kode = '${g.role}'
         AND p.module = '${g.module}' AND p.action = '${g.action}';
    `);
  }
}
