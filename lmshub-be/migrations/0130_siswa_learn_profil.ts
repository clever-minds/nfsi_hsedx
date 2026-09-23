import { MigrationBuilder } from 'node-pg-migrate';

/**
 * 1. Grant `asesmen.update` ke role siswa — dibutuhkan untuk menyimpan jawaban
 * dan submit attempt kuis (PUT /attempts/:id/answers, POST /attempts/:id/submit).
 * 2. Kolom `users.foto_profil` — path foto profil yang diunggah via POST /users/me/photo.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
      FROM roles r, permissions p
     WHERE r.kode = 'siswa'
       AND p.module = 'asesmen' AND p.action = 'update'
    ON CONFLICT DO NOTHING;
  `);

  pgm.addColumn('users', {
    foto_profil: { type: 'text', notNull: false, default: null },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id AND rp.permission_id = p.id
       AND r.kode = 'siswa' AND p.module = 'asesmen' AND p.action = 'update';
  `);
  pgm.dropColumn('users', 'foto_profil');
}
