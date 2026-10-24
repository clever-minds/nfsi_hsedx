import { PoolClient } from 'pg';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE users
       SET name_lengkap = 'National Fire Safety Institute (NFSI)',
           headline = 'Safety & Health Faculty',
           email = CASE WHEN email = 'rina@lmshub.test' THEN 'faculty@nfsi.in' ELSE email END
     WHERE name_lengkap ILIKE '%Rina%' OR email ILIKE '%rina%';
  `);

  await client.query(`
    UPDATE instructor_profiles
       SET bio = 'National Fire Safety Institute (NFSI) accredited safety and technical instructor.'
     WHERE bio ILIKE '%Rina%';
  `);
}

export async function down(_client: PoolClient): Promise<void> {
  // No-op
}
