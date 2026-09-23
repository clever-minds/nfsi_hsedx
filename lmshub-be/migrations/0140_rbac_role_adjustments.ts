import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Penyesuaian matriks role_permissions (lanjutan audit peran):
 * C. admin_ops — beri `pengaturan` view+update. "Admin Operasional" perlu mengakses
 * menu Pengaturan; sebelumnya modul 'pengaturan' tak ada di grant admin_ops.
 * D. instruktur & asisten — beri `enrollment.view` saja. Instruktur/asisten perlu melihat
 * peserta kursusnya; service membatasi row-level via isInstructorScoped. Sengaja TIDAK
 * memberi `cohort.view` karena endpoint GET /cohorts tidak di-scope per-instruktur
 * (akan membocorkan semua cohort lintas kursus). Aksi kelola (create/update) tetap
 * tidak diberikan, jadi mereka read-only pada tab Enrollment.
 */

const GRANTS: Array<{ role: string; module: string; action: string }> = [
  // C — admin_ops akses Pengaturan
  { role: 'admin_ops', module: 'pengaturan', action: 'view' },
  { role: 'admin_ops', module: 'pengaturan', action: 'update' },
  // D — instruktur & asisten lihat peserta kursusnya (read-only, row-scoped di service)
  { role: 'instruktur', module: 'enrollment', action: 'view' },
  { role: 'asisten', module: 'enrollment', action: 'view' },
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
