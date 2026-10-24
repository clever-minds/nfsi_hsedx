import { query } from '../core/db/pool';

async function main() {
  const users = await query(`
    UPDATE users
       SET name_lengkap = 'National Fire Safety Institute (NFSI)',
           headline = 'Safety & Health Faculty',
           email = CASE WHEN email = 'rina@lmshub.test' THEN 'faculty@nfsi.in' ELSE email END
     WHERE name_lengkap ILIKE '%Rina%' OR email ILIKE '%rina%'
    RETURNING id, name_lengkap, email;
  `);
  console.log('Renamed users:', users);

  const profiles = await query(`
    UPDATE instructor_profiles
       SET bio = 'National Fire Safety Institute (NFSI) accredited safety and technical instructor.'
     WHERE bio ILIKE '%Rina%'
    RETURNING id;
  `);
  console.log('Updated profiles:', profiles);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
