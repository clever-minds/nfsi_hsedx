/**
 * fix-hindi-content.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes garbled / corrupted Hindi text in lesson_contents by re-reading the
 * fresh, clean HTML from chemical_safety_data.json and updating the DB rows
 * that belong to the chemical-safety-awareness course.
 *
 * Run once:
 *   npx tsx src/scripts/fix-hindi-content.ts
 * Or via npm script (add to package.json if needed):
 *   "fix:hindi": "tsx src/scripts/fix-hindi-content.ts"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

// ── Types ────────────────────────────────────────────────────────────────────
interface LessonData {
  title: string;
  type: string;
  sort_order: number;
  duration_minutes: number;
  content: string;
}
interface SectionData {
  title: string;
  sort_order: number;
  description: string;
  lessons: LessonData[];
}
interface CoursePayload {
  title: string;
  slug: string;
  summary: string;
  description: string;
  category_name: string;
  category_slug: string;
  category_icon: string;
  level: string;
  price: number;
  language: string;
  sections: SectionData[];
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function fixHindiContent() {
  // 1. Load clean JSON data
  const jsonPath = path.join(__dirname, 'data/chemical_safety_data.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Data file not found at: ${jsonPath}`);
  }
  const courseData: CoursePayload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Find the course by slug
    const courseRes = await client.query(
      `SELECT id FROM courses WHERE slug = $1`,
      [courseData.slug],
    );
    if (courseRes.rows.length === 0) {
      logger.warn(`Course '${courseData.slug}' not found in DB. Run seed:chemical-safety first.`);
      await client.query('ROLLBACK');
      return;
    }
    const courseId = courseRes.rows[0].id;
    logger.info(`Found course id=${courseId} ('${courseData.slug}')`);

    let updated = 0;
    let skipped = 0;

    // 3. Iterate through all sections & lessons from JSON
    for (const sec of courseData.sections) {
      // Find matching DB section by sort_order
      const secRes = await client.query(
        `SELECT id FROM sections WHERE course_id = $1 AND sort_order = $2`,
        [courseId, sec.sort_order],
      );
      if (secRes.rows.length === 0) {
        logger.warn(`Section sort_order=${sec.sort_order} not found — skipping`);
        skipped++;
        continue;
      }
      const sectionId = secRes.rows[0].id;

      for (const les of sec.lessons) {
        // Find matching DB lesson by section_id + sort_order
        const lesRes = await client.query(
          `SELECT id FROM lessons WHERE section_id = $1 AND sort_order = $2`,
          [sectionId, les.sort_order],
        );
        if (lesRes.rows.length === 0) {
          logger.warn(`  Lesson sort_order=${les.sort_order} in section=${sectionId} not found — skipping`);
          skipped++;
          continue;
        }
        const lessonId = lesRes.rows[0].id;

        // Update lesson_contents body with fresh clean content from JSON
        const updRes = await client.query(
          `UPDATE lesson_contents
             SET body = $1, updated_at = NOW()
           WHERE lesson_id = $2 AND sort_order = 1`,
          [les.content, lessonId],
        );

        if (updRes.rowCount && updRes.rowCount > 0) {
          updated++;
          logger.info(`  ✅ Updated lesson "${les.title}" (id=${lessonId})`);
        } else {
          // Fallback: try inserting if missing
          await client.query(
            `INSERT INTO lesson_contents (lesson_id, type, sort_order, body)
             VALUES ($1, 'text', 1, $2)
             ON CONFLICT (lesson_id, sort_order) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
            [lessonId, les.content],
          );
          updated++;
          logger.info(`  ✅ Upserted lesson "${les.title}" (id=${lessonId})`);
        }
      }
    }

    await client.query('COMMIT');
    logger.info(`\n✅ Hindi content fix complete! Updated: ${updated}, Skipped: ${skipped}`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to fix Hindi content');
    throw err;
  } finally {
    client.release();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
fixHindiContent()
  .then(() => {
    logger.info('Done.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, 'Script failed.');
    process.exit(1);
  });
