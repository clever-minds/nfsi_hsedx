import fs from 'fs';
import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

export interface LessonData {
  title: string;
  type: string;
  sort_order: number;
  duration_minutes: number;
  content: string;
}

export interface SectionData {
  title: string;
  sort_order: number;
  description: string;
  lessons: LessonData[];
}

export interface CoursePayload {
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

export async function seedCourseFromJson(jsonPath: string) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Course data file not found at: ${jsonPath}`);
  }
  const courseData: CoursePayload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info(`Seeding course: '${courseData.title}'...`);

    // 1. Ensure Category exists
    let catRes = await client.query('SELECT id FROM categories WHERE slug = $1', [courseData.category_slug]);
    let categoryId: string;
    if (catRes.rows.length > 0) {
      categoryId = catRes.rows[0].id;
      logger.info(`Using existing category: ${courseData.category_name} (${categoryId})`);
    } else {
      const newCat = await client.query(
        `INSERT INTO categories (name, slug, ikon, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, 1, true)
         RETURNING id`,
        [courseData.category_name, courseData.category_slug, courseData.category_icon || '📋', `${courseData.category_name} training and awareness courses.`],
      );
      categoryId = newCat.rows[0].id;
      logger.info(`Created category: ${courseData.category_name} (${categoryId})`);
    }

    // 2. Resolve Instructor
    let insRes = await client.query('SELECT id FROM instructor_profiles LIMIT 1');
    let instructorId: string;
    if (insRes.rows.length > 0) {
      instructorId = insRes.rows[0].id;
    } else {
      const userRes = await client.query('SELECT id FROM users LIMIT 1');
      if (userRes.rows.length === 0) throw new Error('No user found in database!');
      const newIns = await client.query(
        `INSERT INTO instructor_profiles (user_id, bio, is_featured, is_active)
         VALUES ($1, 'Lead Safety Instructor', true, true)
         RETURNING id`,
        [userRes.rows[0].id],
      );
      instructorId = newIns.rows[0].id;
    }

    // 3. Fix Admin Role if needed
    const superAdminRole = await client.query("SELECT id FROM roles WHERE kode = 'super_admin'");
    if (superAdminRole.rows.length > 0) {
      await client.query(
        `UPDATE users SET role_id = $1 WHERE email IN ('admin@lms.com', 'admi@lms.com')`,
        [superAdminRole.rows[0].id],
      );
    }

    // 4. Create or Update Course
    let courseId: string;
    const safeTitle = (courseData.title || '').slice(0, 250);
    const safeSummary = (courseData.summary || '').slice(0, 490);
    const existingCourse = await client.query('SELECT id FROM courses WHERE slug = $1', [courseData.slug]);
    if (existingCourse.rows.length > 0) {
      courseId = existingCourse.rows[0].id;
      logger.info(`Course '${courseData.slug}' exists (${courseId}). Refreshing curriculum...`);
      // Delete old sections and lessons
      const secRows = await client.query('SELECT id FROM sections WHERE course_id = $1', [courseId]);
      for (const s of secRows.rows) {
        const lesRows = await client.query('SELECT id FROM lessons WHERE section_id = $1', [s.id]);
        for (const l of lesRows.rows) {
          await client.query('DELETE FROM lesson_contents WHERE lesson_id = $1', [l.id]);
        }
        await client.query('DELETE FROM lessons WHERE section_id = $1', [s.id]);
      }
      await client.query('DELETE FROM sections WHERE course_id = $1', [courseId]);

      await client.query(
        `UPDATE courses SET
          title = $1, summary = $2, description = $3, category_id = $4,
          instructor_id = $5, level = $6::course_level, price = $7, publication_status = 'publish',
          published_at = NOW(), language = $8, allow_restart = true, updated_at = NOW()
        WHERE id = $9`,
        [
          safeTitle,
          safeSummary,
          courseData.description,
          categoryId,
          instructorId,
          courseData.level,
          courseData.price,
          courseData.language,
          courseId,
        ],
      );
    } else {
      const newCourse = await client.query(
        `INSERT INTO courses (
          title, slug, summary, description, category_id, instructor_id,
          level, price, publication_status, published_at, language, allow_restart
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::course_level, $8, 'publish', NOW(), $9, true
        ) RETURNING id`,
        [
          safeTitle,
          courseData.slug,
          safeSummary,
          courseData.description,
          categoryId,
          instructorId,
          courseData.level,
          courseData.price,
          courseData.language,
        ],
      );
      courseId = newCourse.rows[0].id;
      logger.info(`Created course: '${courseData.title}' (${courseId})`);
    }

    // 5. Insert Sections and Lessons
    let totalDuration = 0;
    let totalLessons = 0;

    for (let sIdx = 0; sIdx < courseData.sections.length; sIdx++) {
      const sec = courseData.sections[sIdx];
      const secRes = await client.query(
        `INSERT INTO sections (course_id, title, sort_order, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [courseId, sec.title, sIdx + 1, sec.description],
      );
      const sectionId = secRes.rows[0].id;

      for (let lIdx = 0; lIdx < sec.lessons.length; lIdx++) {
        const les = sec.lessons[lIdx];
        const duration = les.duration_minutes || 10;
        totalDuration += duration;
        totalLessons++;

        const lesRes = await client.query(
          `INSERT INTO lessons (section_id, title, type, sort_order, duration_minutes, gratis_preview, must_complete)
           VALUES ($1, $2, 'text', $3, $4, true, false)
           RETURNING id`,
          [sectionId, les.title, lIdx + 1, duration],
        );
        const lessonId = lesRes.rows[0].id;

        await client.query(
          `INSERT INTO lesson_contents (lesson_id, type, sort_order, body)
           VALUES ($1, 'text', 1, $2)`,
          [lessonId, les.content],
        );
      }
    }

    await client.query('UPDATE courses SET total_duration_minutes = $1 WHERE id = $2', [totalDuration, courseId]);
    await client.query('COMMIT');

    logger.info(`Successfully seeded '${courseData.title}'! (${courseData.sections.length} sections, ${totalLessons} lessons, ${totalDuration} mins)`);
    return { courseId, totalSections: courseData.sections.length, totalLessons, totalDuration };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, `Failed to seed course from ${jsonPath}`);
    throw err;
  } finally {
    client.release();
  }
}
