import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Beri `kategori.view` kepada instructor dan asisten.
 *
 * Editor course mengisi dropdown kategorinya dari `GET /categories`, yang
 * dijaga `requirePermission('kategori','view')`. Matriks awal (0019) tidak
 * pernah memberi modul `kategori` kepada instructor, padahal instructor
 * memegang `course.create` — jadi mereka bisa membuka form course tapi
 * dropdown kategorinya selalu kosong (403 yang ditelan diam-diam di frontend),
 * dan `category_id` wajib diisi. Hasilnya instructor tidak pernah bisa
 * menyimpan course sama sekali.
 *
 * Hanya `view`: siapa yang boleh membuat/mengubah kategori tidak berubah.
 */
const ROLES = ['instructor', 'asisten'];

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const kode of ROLES) {
    pgm.sql(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
       WHERE r.kode = '${kode}' AND p.module = 'kategori' AND p.action = 'view'
      ON CONFLICT (role_id, permission_id) DO NOTHING;`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const kode of ROLES) {
    pgm.sql(`
      DELETE FROM role_permissions rp
       USING roles r, permissions p
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
         AND r.kode = '${kode}' AND p.module = 'kategori' AND p.action = 'view';`);
  }
}
