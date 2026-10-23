import { pool } from '../core/db/pool';

async function main() {
  const slug = process.argv[2] || 'chemical-safety-awareness';
  console.log(`Unarchiving course with slug: "${slug}"...`);

  const res = await pool.query(
    `UPDATE courses
     SET publication_status = 'publish',
         published_at = COALESCE(published_at, NOW()),
         updated_at = NOW()
     WHERE (slug = $1 OR title ILIKE $2)
     RETURNING id, title, slug, publication_status`,
    [slug, `%${slug}%`]
  );

  if (res.rows.length === 0) {
    console.log(`No course found matching "${slug}". Checking all archived courses:`);
    const allArchived = await pool.query("SELECT id, title, slug, publication_status FROM courses WHERE publication_status = 'archived'");
    console.log(allArchived.rows);
  } else {
    console.log('Successfully unarchived course(s):', res.rows);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error unarchiving course:', err);
  process.exit(1);
});
