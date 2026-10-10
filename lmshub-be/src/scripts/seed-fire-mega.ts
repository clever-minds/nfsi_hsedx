import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}

async function main() {
  logger.info('Seeding Mega Fire Safety Course...');

  let instructorProfile = await one<{ id: string, user_id: string }>(`SELECT id, user_id FROM instructor_profiles LIMIT 1`);
  
  let category = await one<{ id: string }>(`SELECT id FROM categories WHERE slug = 'fire-safety'`);
  if (!category) {
    category = await one<{ id: string }>(`INSERT INTO categories (name, slug, ikon) VALUES ('Fire Safety', 'fire-safety', '🔥') RETURNING id`);
  }

  let course = await one<{ id: string }>(`SELECT id FROM courses WHERE slug = 'mega-fire-safety'`);
  if (course) {
    await pool.query(`DELETE FROM courses WHERE id = $1`, [course.id]);
  }
  
  course = await one<{ id: string }>(
    `INSERT INTO courses (title, slug, summary, description, category_id, instructor_id, level, price, publication_status, language)
     VALUES ('Ultimate Fire Safety Mastery', 'mega-fire-safety', 'Learn everything about fire safety.', 'Complete guide including videos, pdfs, quizzes, and assignments.', $1, $2, 'intermediate', 0, 'publish', 'en')
     RETURNING id`,
    [category?.id, instructorProfile?.id]
  );

  const section = await one<{ id: string }>(`INSERT INTO sections (course_id, title, sort_order) VALUES ($1, 'Core Training', 1) RETURNING id`, [course?.id]);

  const contentTypes = ['video', 'text', 'pdf', 'embed', 'scorm'];
  let order = 1;
  for (const type of contentTypes) {
    const lesson = await one<{ id: string }>(`INSERT INTO lessons (section_id, title, type, sort_order, duration_minutes) VALUES ($1, $2, $3, $4, 10) RETURNING id`, [section?.id, `Learn via ${type}`, type, order]);
    
    let url = 'https://www.youtube.com/watch?v=U4iBCMWC4xM';
    if (type === 'text') url = '<p>This is a text article about fire safety.</p>';
    if (type === 'pdf') url = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    
    await pool.query(`INSERT INTO lesson_contents (lesson_id, type, sort_order, url, duration_seconds) VALUES ($1, $2, 0, $3, 600)`, [lesson?.id, type, url]);
    order++;
  }

  const quizLesson = await one<{ id: string }>(`INSERT INTO lessons (section_id, title, type, sort_order, duration_minutes) VALUES ($1, 'Final Fire Quiz Lesson', 'quiz', $2, 30) RETURNING id`, [section?.id, order++]);
  const quiz = await one<{ id: string }>(`INSERT INTO quizzes (course_id, lesson_id, title, description, time_limit_minutes, max_attempts) VALUES ($1, $2, 'Final Fire Quiz', 'Test your knowledge', 30, 3) RETURNING id`, [course?.id, quizLesson?.id]);
  const qBank = await one<{ id: string }>(`INSERT INTO question_banks (name, course_id, description, created_by) VALUES ('Fire Questions', $1, 'Questions for Fire Course', $2) RETURNING id`, [course?.id, instructorProfile?.user_id]);
  const question = await one<{ id: string }>(`INSERT INTO questions (question_bank_id, type, question_text, points) VALUES ($1, 'single_choice', 'What is the color of fire?', 10) RETURNING id`, [qBank?.id]);
  await pool.query(`INSERT INTO question_options (question_id, option_text, is_correct, sort_order) VALUES ($1, 'Red/Orange', true, 1), ($1, 'Green', false, 2)`, [question?.id]);
  await pool.query(`INSERT INTO quiz_questions (quiz_id, question_id, sort_order) VALUES ($1, $2, 1)`, [quiz?.id, question?.id]);

  const assignmentLesson = await one<{ id: string }>(`INSERT INTO lessons (section_id, title, type, sort_order, duration_minutes) VALUES ($1, 'Fire Evacuation Plan Lesson', 'assignment', $2, 60) RETURNING id`, [section?.id, order++]);
  await pool.query(`INSERT INTO assignments (course_id, lesson_id, title, instructions, due_at, submission_type, points_maximum) VALUES ($1, $2, 'Fire Evacuation Plan', 'Draw a fire evacuation plan.', now() + interval '7 days', 'file', 100)`, [course?.id, assignmentLesson?.id]);

  logger.info('✅ Mega Fire Safety Course created with all features!');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
