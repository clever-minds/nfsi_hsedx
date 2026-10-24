import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

async function main() {
  const client = await pool.connect();
  try {
    logger.info('Fixing must_complete on lessons...');
    const r1 = await client.query('UPDATE lessons SET must_complete = true WHERE must_complete = false RETURNING id');
    logger.info(`Updated ${r1.rowCount} lessons to must_complete = true`);

    logger.info('Recalculating course progress for all enrollments...');
    const r2 = await client.query(`
      WITH progress_calc AS (
        SELECT 
          e.id AS enrollment_id,
          COUNT(DISTINCT l.id) AS total_lessons,
          COUNT(DISTINCT CASE WHEN lp.status = 'completed' THEN lp.lesson_id END) AS completed_count
        FROM enrollments e
        JOIN sections s ON s.course_id = e.course_id AND s.deleted_at IS NULL
        JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL
        LEFT JOIN lesson_progress lp ON lp.enrollment_id = e.id AND lp.lesson_id = l.id AND lp.deleted_at IS NULL
        WHERE e.deleted_at IS NULL
        GROUP BY e.id
      )
      INSERT INTO course_progress (enrollment_id, progress_percent, completed_lessons_count, total_lesson, last_accessed_at, completed_at)
      SELECT 
        enrollment_id,
        CASE WHEN total_lessons > 0 THEN ROUND((completed_count::numeric / total_lessons::numeric) * 100, 2) ELSE 0 END,
        completed_count,
        total_lessons,
        NOW(),
        CASE WHEN total_lessons > 0 AND completed_count >= total_lessons THEN NOW() ELSE NULL END
      FROM progress_calc
      ON CONFLICT (enrollment_id) DO UPDATE SET
        progress_percent = EXCLUDED.progress_percent,
        completed_lessons_count = EXCLUDED.completed_lessons_count,
        total_lesson = EXCLUDED.total_lesson,
        last_accessed_at = NOW(),
        completed_at = CASE WHEN EXCLUDED.progress_percent >= 100 THEN COALESCE(course_progress.completed_at, NOW()) ELSE course_progress.completed_at END;
    `);
    logger.info(`Updated course_progress table`);

    logger.info('Marking completed enrollments...');
    const r3 = await client.query(`
      UPDATE enrollments
         SET status = 'completed'
       WHERE id IN (
         SELECT enrollment_id FROM course_progress WHERE progress_percent >= 100
       ) AND status IN ('registered', 'active')
       RETURNING id;
    `);
    logger.info(`Marked ${r3.rowCount} enrollments as completed`);

    logger.info('Done fixing progress and certificates!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
