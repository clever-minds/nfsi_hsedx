import fs from 'fs';
import path from 'path';
import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

interface LessonData {
  title: string;
  type?: string;
  sort_order: number;
  duration_minutes: number;
  video_url?: string;
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
  meta?: Record<string, any>;
  sections: SectionData[];
}

interface QuestionOption {
  text: string;
  is_correct: boolean;
}

interface QuestionItem {
  q_num: number;
  question_text: string;
  options: QuestionOption[];
}

export async function seedChemicalSafetyCourse() {
  const jsonPath = path.join(__dirname, 'data/chemical_safety_data.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Course data file not found at: ${jsonPath}`);
  }
  const courseData: CoursePayload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const questionsPath = path.join(__dirname, 'data/chemical_safety_questions.json');
  let questionsData: QuestionItem[] = [];
  if (fs.existsSync(questionsPath)) {
    questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info(`Seeding '${courseData.title}'...`);

    // 1. Ensure Category exists
    const catRes = await client.query('SELECT id FROM categories WHERE slug = $1', [courseData.category_slug]);
    let categoryId: string;
    if (catRes.rows.length > 0) {
      categoryId = catRes.rows[0].id;
      logger.info(`Using existing category: ${courseData.category_name} (${categoryId})`);
    } else {
      const newCat = await client.query(
        `INSERT INTO categories (name, slug, ikon, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, 1, true)
         RETURNING id`,
        [courseData.category_name, courseData.category_slug, courseData.category_icon, 'Chemical Safety, handling, hazardous materials, and environmental protection training.'],
      );
      categoryId = newCat.rows[0].id;
      logger.info(`Created category: ${courseData.category_name} (${categoryId})`);
    }

    // 2. Resolve Instructor
    const insRes = await client.query('SELECT id FROM instructor_profiles LIMIT 1');
    let instructorId: string;
    let instructorUserId: string;
    if (insRes.rows.length > 0) {
      instructorId = insRes.rows[0].id;
      const uRes = await client.query('SELECT user_id FROM instructor_profiles WHERE id = $1', [instructorId]);
      instructorUserId = uRes.rows[0]?.user_id;
    } else {
      const userRes = await client.query('SELECT id FROM users LIMIT 1');
      if (userRes.rows.length === 0) throw new Error('No user found in database!');
      instructorUserId = userRes.rows[0].id;
      const newIns = await client.query(
        `INSERT INTO instructor_profiles (user_id, bio, is_featured, is_active)
         VALUES ($1, 'Lead Safety Instructor', true, true)
         RETURNING id`,
        [instructorUserId],
      );
      instructorId = newIns.rows[0].id;
    }
    logger.info(`Using instructor: ${instructorId}`);

    // 3. Fix Admin Role if needed
    const superAdminRole = await client.query("SELECT id FROM roles WHERE kode = 'super_admin'");
    if (superAdminRole.rows.length > 0) {
      await client.query(
        `UPDATE users SET role_id = $1 WHERE email IN ('admin@lms.com', 'admi@lms.com')`,
        [superAdminRole.rows[0].id],
      );
    }

    // 4. Create or Update Course with Full Meta
    let courseId: string;
    const courseMeta = courseData.meta || {};
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
          published_at = NOW(), language = $8, allow_restart = true, updated_at = NOW(), meta = $10
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
          JSON.stringify(courseMeta),
        ],
      );
    } else {
      const newCourse = await client.query(
        `INSERT INTO courses (
          title, slug, summary, description, category_id, instructor_id,
          level, price, publication_status, published_at, language, allow_restart, meta
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::course_level, $8, 'publish', NOW(), $9, true, $10
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
          JSON.stringify(courseMeta),
        ],
      );
      courseId = newCourse.rows[0].id;
      logger.info(`Created course: '${courseData.title}' (${courseId})`);
    }

    // 5. Insert Sections and Lessons
    let totalDuration = 0;
    let totalLessons = 0;
    let lastSectionId: string | null = null;

    for (let sIdx = 0; sIdx < courseData.sections.length; sIdx++) {
      const sec = courseData.sections[sIdx];
      const secRes = await client.query(
        `INSERT INTO sections (course_id, title, sort_order, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [courseId, sec.title, sIdx + 1, sec.description],
      );
      const sectionId = secRes.rows[0].id;
      if (sIdx === courseData.sections.length - 1) {
        lastSectionId = sectionId;
      }

      for (let lIdx = 0; lIdx < sec.lessons.length; lIdx++) {
        const les = sec.lessons[lIdx];
        const duration = les.duration_minutes || 10;
        totalDuration += duration;
        totalLessons++;

        const isVideo = les.type === 'video' || (les.video_url && les.video_url.length > 0);
        const lessonType = isVideo ? 'video' : 'text';
        const isPreview = (sIdx === 0 && lIdx === 0); // Only Lesson 1.1 has preview
        const videoUrl = les.video_url || (sIdx === 0 && lIdx === 0 ? 'https://www.youtube.com/watch?v=kYI-h4jL1d4' : null);

        const lesRes = await client.query(
          `INSERT INTO lessons (section_id, title, type, sort_order, duration_minutes, gratis_preview, must_complete)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id`,
          [sectionId, les.title, lessonType, lIdx + 1, duration, isPreview],
        );
        const lessonId = lesRes.rows[0].id;

        await client.query(
          `INSERT INTO lesson_contents (lesson_id, type, sort_order, body, url)
           VALUES ($1, $2, 1, $3, $4)`,
          [lessonId, lessonType, les.content, videoUrl],
        );
      }
    }

    await client.query('UPDATE courses SET total_duration_minutes = $1 WHERE id = $2', [totalDuration, courseId]);

    // 6. Question Bank Seeder
    let bankId: string;
    const bankName = 'Chemical Safety Awareness - Question Bank | केमिकल सेफ्टी प्रश्न बैंक';
    const existingBank = await client.query(
      'SELECT id FROM question_banks WHERE course_id = $1 AND deleted_at IS NULL LIMIT 1',
      [courseId],
    );

    if (existingBank.rows.length > 0) {
      bankId = existingBank.rows[0].id;
      logger.info(`Using existing question bank: ${bankId}`);
      // Clean old questions in this bank
      const oldQuestions = await client.query('SELECT id FROM questions WHERE question_bank_id = $1', [bankId]);
      for (const qRow of oldQuestions.rows) {
        await client.query('DELETE FROM question_options WHERE question_id = $1', [qRow.id]);
        await client.query('DELETE FROM quiz_questions WHERE question_id = $1', [qRow.id]);
      }
      await client.query('DELETE FROM questions WHERE question_bank_id = $1', [bankId]);
    } else {
      const newBank = await client.query(
        `INSERT INTO question_banks (name, course_id, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          bankName,
          courseId,
          'Comprehensive 30-question bank for Chemical Safety Awareness training covering hazards, exposure routes, GHS, SDS, storage, spill response, and waste management.',
          instructorUserId,
        ],
      );
      bankId = newBank.rows[0].id;
      logger.info(`Created question bank: ${bankId}`);
    }

    // 7. Insert all 30 Questions and Options
    const insertedQuestionIds: string[] = [];
    for (const qItem of questionsData) {
      const qRes = await client.query(
        `INSERT INTO questions (question_bank_id, type, question_text, points)
         VALUES ($1, 'single_choice', $2, 1)
         RETURNING id`,
        [bankId, qItem.question_text],
      );
      const questionId = qRes.rows[0].id;
      insertedQuestionIds.push(questionId);

      for (let oIdx = 0; oIdx < qItem.options.length; oIdx++) {
        const opt = qItem.options[oIdx];
        await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [questionId, opt.text, opt.is_correct, oIdx + 1],
        );
      }
    }
    logger.info(`Inserted ${insertedQuestionIds.length} assessment questions with options.`);

    // 8. Quiz Seeder
    const quizTitle = 'Chemical Safety Awareness - Final Assessment | अंतिम मूल्यांकन परीक्षा';
    let quizId: string;
    const existingQuiz = await client.query(
      'SELECT id FROM quizzes WHERE course_id = $1 AND deleted_at IS NULL LIMIT 1',
      [courseId],
    );

    if (existingQuiz.rows.length > 0) {
      quizId = existingQuiz.rows[0].id;
      logger.info(`Using existing quiz: ${quizId}`);
      await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [quizId]);
      await client.query(
        `UPDATE quizzes SET
          title = $1, description = $2, time_limit_minutes = 30, max_attempts = 3,
          passing_score = 80.00, show_answers_after_completion = true, is_active = true,
          total_pointsts = $3, section_id = $4, updated_at = NOW()
        WHERE id = $5`,
        [
          quizTitle,
          'Comprehensive 30-question final assessment covering all 10 modules of Chemical Safety Awareness. Minimum 80% passing score is required.',
          insertedQuestionIds.length,
          lastSectionId,
          quizId,
        ],
      );
    } else {
      const newQuiz = await client.query(
        `INSERT INTO quizzes (
          course_id, section_id, title, description, time_limit_minutes,
          randomize_questions, randomize_options, max_attempts, passing_score,
          show_answers_after_completion, is_active, total_pointsts
        ) VALUES (
          $1, $2, $3, $4, 30,
          false, false, 3, 80.00,
          true, true, $5
        ) RETURNING id`,
        [
          courseId,
          lastSectionId,
          quizTitle,
          'Comprehensive 30-question final assessment covering all 10 modules of Chemical Safety Awareness. Minimum 80% passing score is required.',
          insertedQuestionIds.length,
        ],
      );
      quizId = newQuiz.rows[0].id;
      logger.info(`Created final assessment quiz: ${quizId}`);
    }

    // Link all 30 questions to the quiz
    for (let qIdx = 0; qIdx < insertedQuestionIds.length; qIdx++) {
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_id, sort_order)
         VALUES ($1, $2, $3)`,
        [quizId, insertedQuestionIds[qIdx], qIdx + 1],
      );
    }

    await client.query('COMMIT');
    logger.info(
      `\n=======================================================\n` +
      `✅ Chemical Safety Course seeded successfully!\n` +
      `   Sections: ${courseData.sections.length}\n` +
      `   Lessons: ${totalLessons} (${totalDuration} mins)\n` +
      `   Question Bank: ${bankName} (${insertedQuestionIds.length} questions)\n` +
      `   Final Assessment Quiz: ${quizTitle} (Passing: 80%, 30 mins)\n` +
      `=======================================================`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to seed Chemical Safety Course');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedChemicalSafetyCourse()
    .then(() => {
      logger.info('Finished chemical safety course seed.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Seed failed.');
      process.exit(1);
    });
}
