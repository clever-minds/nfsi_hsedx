import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Beri `category.view` kepada instructor dan asisten.
 *
 * Editor course mengisi dropdown categorynya from `GET /categories`, yang
 * dijaga `requirePermission('category','view')`. Matriks awal (0019) no
 * pernah memberi modul `category` kepada instructor, padahal instructor
 * memegang `course.create` — jadi mereka bisa membuka form course tapi
 * dropdown categorynya selalu kosong (403 yang ditelan diam-diam di frontend),
 * dan `category_id` wajib diisi. Hasilnya instructor no pernah bisa
 * menyimpan course sama sekali.
 *
 * Hanya `view`: siapa yang boleh membuat/mengubah category no berubah.
 */
const ROLES = ['instructor', 'assistant'];

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const kode of ROLES) {
    pgm.sql(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
       WHERE r.kode = '${kode}' AND p.module = 'category' AND p.action = 'view'
      ON CONFLICT (role_id, permission_id) DO NOTHING;`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const kode of ROLES) {
    pgm.sql(`
      DELETE FROM role_permissions rp
       USING roles r, permissions p
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
         AND r.kode = '${kode}' AND p.module = 'category' AND p.action = 'view';`);
  }
}
