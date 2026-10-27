import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE users
       SET name_lengkap = 'National Fire Safety Institute (NFSI)',
           email = CASE WHEN email = 'rina@lmshub.test' THEN 'faculty@nfsi.in' ELSE email END
     WHERE name_lengkap ILIKE '%Rina%' OR email ILIKE '%rina%';
  `);

  pgm.sql(`
    UPDATE instructor_profiles
       SET bio = 'National Fire Safety Institute (NFSI) accredited safety and technical instructor.'
     WHERE bio ILIKE '%Rina%';
  `);
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // No-op
}
