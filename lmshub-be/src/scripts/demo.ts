import { pool } from '../core/db/pool';
import { hashPassword } from '../core/auth/password';
import { logger } from '../core/logger/logger';
import { COURSE_CONTENT, INSTRUCTORS } from './demo-course-content';
import {
  CATEGORIES,
  COURSES,
  LEAD_COMPLETED,
  LEAD_IN_PROGRESS,
  LEAD_STUDENT,
  LEVEL_LABEL,
  OTHER_STUDENTS,
  curriculumFor,
  type InstructorKey,
} from './demo-data';
import { HERO_URL, LESSON_VIDEO_URLS, avatarUrl, courseThumbnailUrl, installDemoMedia } from './demo-media';
import { retireLegacyDemoData, retirementPlan, retirementRequested } from './demo-retire-legacy';
import { refreshDemoTimeline } from './demo-timeline';
import { installDemoTransactions } from './demo-transaksi';

/**
 * DEMO SEEDER — a full, presentable catalogue for development and for the public
 * demo site. NOT for production; production only needs `npm run seed`, which
 * creates the super admin.
 *
 * Contents: 6 categories, 20 published courses in English with real curricula,
 * 4 instructors, 9 students, quizzes, assignments, enrolments with progress,
 * certificates, reviews, forum threads, lesson Q&A, live sessions and a month of
 * income and expenses.
 *
 * Idempotent. Re-running it is the supported way to refresh a demo site before
 * showing it to anyone — `refreshDemoTimeline()` moves every date back into the
 * windows the dashboards query, so the demo never looks abandoned.
 */

const q = pool.query.bind(pool);

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}

async function upsertUser(name: string, email: string, roleId: string, passHash: string): Promise<string> {
  const r = await one<{ id: string }>(
    `INSERT INTO users (nama_lengkap, email, password_hash, role_id, status, email_verified_at)
     VALUES ($1,$2,$3,$4,'active',now())
     ON CONFLICT (email) WHERE deleted_at IS NULL AND email IS NOT NULL
       DO UPDATE SET nama_lengkap = EXCLUDED.nama_lengkap
     RETURNING id`,
    [name, email, passHash, roleId],
  );
  if (r) return r.id;
  return (await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]))!.id;
}

async function main() {
  const roleId = async (kode: string) =>
    (await one<{ id: string }>(`SELECT id FROM roles WHERE kode=$1`, [kode]))!.id;

  const instructorRole = await roleId('instruktur');
  const studentRole = await roleId('siswa');
  const pass = await hashPassword('Demo12345!');

  // 0) Retire the previous Indonesian demo catalogue --------------------------
  // Slugs changed with the rewrite, so a fresh seed on an older installation
  // would leave both catalogues side by side. But retiring soft-deletes accounts
  // and courses, and on a public demo server those may be the very logins a
  // reviewer is already using — so it only happens when asked for explicitly.
  if (retirementRequested()) {
    const plan = retirementPlan();
    logger.warn(
      `Retiring the previous demo data: ${plan.courses} courses, ${plan.categories} categories, ` +
        `and these accounts: ${plan.accounts.join(', ')}`,
    );
    await retireLegacyDemoData();
  } else {
    const plan = retirementPlan();
    logger.info(
      'Keeping the previous demo data. Re-run with --retire-legacy to soft-delete the old ' +
        `Indonesian catalogue (${plan.courses} courses) and its accounts (${plan.accounts.join(', ')}).`,
    );
  }

  // 0b) Media -----------------------------------------------------------------
  // Generated before anything references it, so no row ever points at a missing file.
  await installDemoMedia({
    courses: COURSES.map((c) => ({
      slug: c.slug,
      title: c.title,
      category: c.category,
      categoryLabel: CATEGORIES.find((k) => k.slug === c.category)?.name ?? c.category,
      level: LEVEL_LABEL[c.level],
    })),
    people: [
      ...Object.entries(INSTRUCTORS).map(([key, i]) => ({ key, name: i.name })),
      { key: 'lead-student', name: LEAD_STUDENT.name },
    ],
  });

  // The demo catalogue is priced in USD; Midtrans is IDR-only and will correctly
  // drop out of the checkout options, which is the multi-gateway behaviour working.
  //
  // Only applied while the setting is still the shipped default. A store that has
  // deliberately chosen its currency keeps it — the same rule the default-branding
  // installer follows, and it means refreshing the demo cannot silently reprice a
  // live storefront.
  const currencyChanged = await one<{ id: string }>(
    `UPDATE settings SET nilai = 'INR'
      WHERE key = 'currency.code' AND deleted_at IS NULL AND nilai IN ('IDR', '', 'USD', 'INR')
      RETURNING id`,
  );
  if (!currencyChanged) {
    logger.info('Currency left as configured; the demo prices are INR figures.');
  }

  // The shipped default course price is an IDR figure. Left alone under a USD
  // catalogue it reads as a $500,000 course on the new-course form.
  await q(
    `UPDATE settings SET nilai = '49'
      WHERE key = 'harga.default_kursus' AND deleted_at IS NULL AND nilai = '500000'`,
  );

  // 1) People ----------------------------------------------------------------
  const instructorUserIds: Record<string, string> = {};
  const instructorProfileIds: Record<string, string> = {};

  for (const [key, person] of Object.entries(INSTRUCTORS)) {
    const userId = await upsertUser(person.name, person.email, instructorRole, pass);
    instructorUserIds[key] = userId;

    await q(`UPDATE users SET foto_profil = $2 WHERE id = $1`, [userId, avatarUrl(key)]);

    // Aggregates are recomputed from real rows further down; these are the floor.
    const taught = COURSES.filter((c) => c.instructor === key).length;
    instructorProfileIds[key] = (await one<{ id: string }>(
      `INSERT INTO instructor_profiles (user_id, bio, keahlian, sosial_media, rating_avg, rating_count, total_siswa, status_verifikasi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'terverifikasi')
       ON CONFLICT (user_id) DO UPDATE SET
         bio = EXCLUDED.bio, keahlian = EXCLUDED.keahlian, sosial_media = EXCLUDED.sosial_media,
         rating_avg = EXCLUDED.rating_avg, rating_count = EXCLUDED.rating_count,
         total_siswa = EXCLUDED.total_siswa, status_verifikasi = 'terverifikasi'
       RETURNING id`,
      [
        userId,
        person.bio,
        JSON.stringify(person.expertise),
        JSON.stringify(person.social),
        (4.6 + taught * 0.02).toFixed(1),
        180 + taught * 47,
        1200 + taught * 380,
      ],
    ))!.id;
  }

  const leadStudentId = await upsertUser(LEAD_STUDENT.name, LEAD_STUDENT.email, studentRole, pass);
  await q(`UPDATE users SET foto_profil = $2 WHERE id = $1`, [leadStudentId, avatarUrl('lead-student')]);

  const otherStudentIds: string[] = [];
  for (const s of OTHER_STUDENTS) {
    otherStudentIds.push(await upsertUser(s.name, s.email, studentRole, pass));
  }

  // 2) Categories -------------------------------------------------------------
  const catIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    catIds[c.slug] = (await one<{ id: string }>(
      `INSERT INTO categories (nama, slug, ikon) VALUES ($1,$2,$3)
       ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET nama = EXCLUDED.nama, ikon = EXCLUDED.ikon
       RETURNING id`,
      [c.name, c.slug, c.icon],
    ))!.id;
  }

  // 3) Courses, curriculum and lesson video -----------------------------------
  const courseIds: Record<string, string> = {};

  for (let i = 0; i < COURSES.length; i++) {
    const c = COURSES[i];
    const content = COURSE_CONTENT[c.slug];
    const sections = curriculumFor(c.slug);
    const lessonCount = sections.reduce((n, s) => n + s.lessons.length, 0);

    const row = await one<{ id: string }>(
      `INSERT INTO courses (judul, slug, ringkasan, deskripsi, category_id, instructor_id, level, harga, harga_coret,
                            status_publikasi, bahasa, rating_avg, rating_count, jumlah_siswa,
                            durasi_total_menit, meta, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'terbit','en',$10,$11,$12,$13,$14, now() - interval '45 days')
       ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET
         judul=EXCLUDED.judul, status_publikasi='terbit', harga=EXCLUDED.harga, harga_coret=EXCLUDED.harga_coret,
         ringkasan=EXCLUDED.ringkasan, deskripsi=EXCLUDED.deskripsi, bahasa=EXCLUDED.bahasa,
         rating_avg=EXCLUDED.rating_avg, rating_count=EXCLUDED.rating_count,
         jumlah_siswa=EXCLUDED.jumlah_siswa, meta=EXCLUDED.meta, durasi_total_menit=EXCLUDED.durasi_total_menit,
         category_id=EXCLUDED.category_id, instructor_id=EXCLUDED.instructor_id, level=EXCLUDED.level
       RETURNING id`,
      [
        c.title,
        c.slug,
        content.summary,
        content.description,
        catIds[c.category],
        instructorProfileIds[c.instructor],
        c.level,
        c.price,
        // A round list price above the selling price, so the discount badge is honest.
        Math.round(c.price * 1.6),
        (4.2 + ((i * 7) % 8) / 10).toFixed(1),
        38 + ((i * 31) % 180),
        140 + ((i * 137) % 900),
        lessonCount * 11,
        JSON.stringify({
          thumbnail_url: courseThumbnailUrl(c.slug),
          yang_dipelajari: content.learn,
          persyaratan: content.requirements,
          cocok_untuk: content.audience,
        }),
      ],
    );
    courseIds[c.slug] = row!.id;

    // Rebuild the curriculum when there is none, and also when the existing one
    // still points at a third-party video host. Slugs reused from the older
    // Indonesian catalogue keep their sections, so a plain "has any section"
    // check would leave three courses with Indonesian lesson titles and dead
    // YouTube embeds inside an otherwise English catalogue.
    const stale = await one<{ ok: number }>(
      `SELECT 1 AS ok FROM lesson_contents lc
         JOIN lessons l ON l.id = lc.lesson_id
         JOIN sections s ON s.id = l.section_id
        WHERE s.course_id = $1 AND lc.url NOT LIKE '/uploads/%' LIMIT 1`,
      [row!.id],
    );
    if (stale) {
      await q(
        `DELETE FROM sections WHERE course_id = $1`,
        [row!.id],
      );
    }

    const hasSections = await one(`SELECT 1 AS ok FROM sections WHERE course_id = $1 LIMIT 1`, [row!.id]);
    if (!hasSections) {
      let sOrder = 1;
      let lessonIndex = 0;

      for (const section of sections) {
        const sec = await one<{ id: string }>(
          `INSERT INTO sections (course_id, judul, urutan) VALUES ($1,$2,$3) RETURNING id`,
          [row!.id, section.title, sOrder],
        );

        let lOrder = 1;
        for (const lessonTitle of section.lessons) {
          const minutes = 7 + ((lessonIndex * 5) % 12);
          const lesson = await one<{ id: string }>(
            `INSERT INTO lessons (section_id, judul, tipe, urutan, durasi_menit, gratis_preview, wajib_selesai)
             VALUES ($1,$2,'video',$3,$4,$5,true) RETURNING id`,
            // First lesson of the opening section is the free preview.
            [sec!.id, lessonTitle, lOrder, minutes, sOrder === 1 && lOrder === 1],
          );

          await q(
            `INSERT INTO lesson_contents (lesson_id, tipe, urutan, url, durasi_detik)
             VALUES ($1,'video',0,$2,$3)`,
            // Locally hosted clips, alternated. Nothing here can be taken down by a third party.
            [lesson!.id, LESSON_VIDEO_URLS[lessonIndex % LESSON_VIDEO_URLS.length], minutes * 60],
          );

          lOrder++;
          lessonIndex++;
        }
        sOrder++;
      }
    }
  }

  // 4) Quizzes and assignments (first ten courses) ------------------------------
  for (const c of COURSES.slice(0, 10)) {
    const courseId = courseIds[c.slug];
    const authorId = instructorUserIds[c.instructor];
    const content = COURSE_CONTENT[c.slug];

    const hasQuiz = await one(
      `SELECT 1 AS ok FROM quizzes WHERE course_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [courseId],
    );

    if (!hasQuiz) {
      const bank = await one<{ id: string }>(
        `INSERT INTO question_banks (nama, course_id, deskripsi, created_by)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [`Question Bank — ${c.title}`, courseId, `Questions covering the material in ${c.title}.`, authorId],
      );

      const quiz = await one<{ id: string }>(
        `INSERT INTO quizzes (course_id, judul, deskripsi, batas_waktu_menit, attempt_maksimal,
                              passing_score, tampilkan_jawaban_setelah_selesai, is_aktif, total_poin)
         VALUES ($1,$2,'Check your understanding before moving on to the final project.',15,3,70,true,true,4)
         RETURNING id`,
        [courseId, `Final Quiz — ${c.title}`],
      );

      // Questions are built from the course's own outcomes, so each quiz differs.
      const questions: Array<[string, string[], number]> = [
        [
          `Which of these is a stated outcome of "${c.title}"?`,
          [content.learn[0], 'Learning to cook professionally', 'Studying medieval history', 'Training for a marathon'],
          0,
        ],
        [
          'Which section of this course contains the hands-on work?',
          ['Getting Started', 'Core Concepts', 'Putting It Into Practice', 'There is none'],
          2,
        ],
        ['What score do you need to pass this quiz?', ['50%', '60%', '70%', '90%'], 2],
        [
          'What do you receive after completing 100% of a course?',
          ['Nothing', 'A certificate of completion', 'A cash reward', 'Physical merchandise'],
          1,
        ],
      ];

      let order = 1;
      for (const [text, options, correctIndex] of questions) {
        const question = await one<{ id: string }>(
          `INSERT INTO questions (question_bank_id, tipe, teks_soal, poin) VALUES ($1,'pilihan_tunggal',$2,1) RETURNING id`,
          [bank!.id, text],
        );
        for (let o = 0; o < options.length; o++) {
          await q(
            `INSERT INTO question_options (question_id, teks_opsi, is_benar, urutan) VALUES ($1,$2,$3,$4)`,
            [question!.id, options[o], o === correctIndex, o + 1],
          );
        }
        await q(`INSERT INTO quiz_questions (quiz_id, question_id, urutan) VALUES ($1,$2,$3)`, [
          quiz!.id,
          question!.id,
          order++,
        ]);
      }
    }

    const hasAssignment = await one(
      `SELECT 1 AS ok FROM assignments WHERE course_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [courseId],
    );
    if (!hasAssignment) {
      await q(
        `INSERT INTO assignments (course_id, judul, instruksi, tenggat_at, tipe_pengumpulan, poin_maksimal)
         VALUES ($1,$2,$3, now() + interval '14 days', 'file', 100)`,
        [
          courseId,
          `Final Project — ${c.title}`,
          `Build the project described in the final section of "${c.title}", then upload your work as a PDF or ZIP. Include a short note on the decisions you made and anything you would do differently.`,
        ],
      );
    }
  }

  // 5) Lead student: progress and certificates -----------------------------------
  const enrolLead = async (slug: string, status: 'aktif' | 'selesai', percent: number) => {
    const courseId = courseIds[slug];
    await q(
      `INSERT INTO enrollments (user_id, course_id, sumber, status)
       SELECT $1,$2,'assign',$3
       WHERE NOT EXISTS (SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL)`,
      [leadStudentId, courseId, status],
    );
    const enr = await one<{ id: string }>(
      `SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [leadStudentId, courseId],
    );
    await q(`UPDATE enrollments SET status=$2 WHERE id=$1`, [enr!.id, status]);

    const lessons = await pool.query<{ id: string }>(
      `SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id
        WHERE s.course_id=$1 AND l.deleted_at IS NULL ORDER BY s.urutan, l.urutan`,
      [courseId],
    );
    const total = lessons.rows.length;
    const done = Math.round((percent / 100) * total);

    for (let i = 0; i < done; i++) {
      await q(
        `INSERT INTO lesson_progress (enrollment_id, lesson_id, status, posisi_detik, waktu_selesai)
         VALUES ($1,$2,'selesai',600, now() - interval '1 day')
         ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET status='selesai'`,
        [enr!.id, lessons.rows[i].id],
      );
    }

    await q(
      `INSERT INTO course_progress (enrollment_id, persen_selesai, jumlah_lesson_selesai, total_lesson, last_accessed_at, completed_at)
       VALUES ($1,$2::numeric,$3,$4, now(), CASE WHEN $2::numeric >= 100 THEN now() ELSE NULL END)
       ON CONFLICT (enrollment_id) DO UPDATE SET
         persen_selesai=EXCLUDED.persen_selesai, jumlah_lesson_selesai=EXCLUDED.jumlah_lesson_selesai,
         total_lesson=EXCLUDED.total_lesson,
         completed_at=CASE WHEN EXCLUDED.persen_selesai >= 100 THEN COALESCE(course_progress.completed_at, now()) ELSE NULL END`,
      [enr!.id, percent, done, total],
    );
    return enr!.id;
  };

  for (const [slug, percent] of LEAD_IN_PROGRESS) await enrolLead(slug, 'aktif', percent);

  for (const slug of LEAD_COMPLETED) {
    const enrId = await enrolLead(slug, 'selesai', 100);

    // Derived from the enrolment id rather than a counter. `certificates_nomor_uq`
    // is a plain unique index, so a soft-deleted certificate keeps its number
    // reserved for ever — as it should, since a real certificate number must never
    // be reissued. A counter starting at 0001 collides with any earlier demo run.
    const number = `LMS-${new Date().getFullYear()}-${enrId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    await q(
      `INSERT INTO certificates (user_id, course_id, enrollment_id, status, nomor_sertifikat, kode_verifikasi, tanggal_terbit, diterbitkan_oleh)
       SELECT $1,$2,$3,'terbit',$4,$5, now() - interval '5 days', $6
       WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE enrollment_id=$3 AND is_revoked=false AND deleted_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM certificates WHERE nomor_sertifikat = $4)`,
      [leadStudentId, courseIds[slug], enrId, number, `VERIF-${number}`, instructorUserIds.rina],
    );
  }

  // 6) Other students -------------------------------------------------------------
  const allSlugs = COURSES.map((c) => c.slug);
  for (let s = 0; s < otherStudentIds.length; s++) {
    for (let k = 0; k < 3; k++) {
      const slug = allSlugs[(s * 3 + k * 5) % allSlugs.length];
      await q(
        `INSERT INTO enrollments (user_id, course_id, sumber, status)
         SELECT $1,$2,'assign','aktif'
         WHERE NOT EXISTS (SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL)`,
        [otherStudentIds[s], courseIds[slug]],
      );
    }
  }

  // 7) Reviews --------------------------------------------------------------------
  const REVIEW_TEXT = [
    'Clear, well paced, and every section ends with something you have actually built.',
    'The instructor explains the reasoning, not just the steps. That made the difference for me.',
    'Plenty of hands-on work. I was applying this at my job within the first week.',
    'Good production quality and a sensible order. Nothing felt skipped.',
    'Worth it. I came in knowing almost nothing and finished with a project I am proud of.',
    'Strong course overall. A couple of sections move quickly, but the exercises fill the gap.',
    'One of the better courses I have taken — practical without being shallow.',
  ];

  const hasReview = await one(`SELECT 1 AS ok FROM reviews WHERE deleted_at IS NULL LIMIT 1`);
  if (!hasReview) {
    const forReview = await pool.query<{ id: string; user_id: string; course_id: string }>(
      `SELECT e.id, e.user_id, e.course_id FROM enrollments e
        WHERE e.deleted_at IS NULL AND e.status IN ('aktif','selesai')
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.enrollment_id = e.id AND r.deleted_at IS NULL)
        ORDER BY e.course_id, e.created_at`,
    );

    let ri = 0;
    const reviewed = new Set<string>();
    const perCourse: Record<string, number> = {};

    for (const e of forReview.rows) {
      perCourse[e.course_id] = (perCourse[e.course_id] ?? 0) + 1;
      if (perCourse[e.course_id] > 4) continue;
      await q(
        `INSERT INTO reviews (enrollment_id, user_id, course_id, rating, ulasan)
         VALUES ($1,$2,$3,$4,$5)`,
        [e.id, e.user_id, e.course_id, [5, 4, 5, 4, 5][ri % 5], REVIEW_TEXT[ri % REVIEW_TEXT.length]],
      );
      reviewed.add(e.course_id);
      ri++;
    }

    for (const courseId of reviewed) {
      await q(
        `UPDATE courses SET
           rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM reviews
                                   WHERE course_id=$1 AND deleted_at IS NULL AND is_hidden=false),0),
           rating_count = (SELECT COUNT(*) FROM reviews
                            WHERE course_id=$1 AND deleted_at IS NULL AND is_hidden=false)
         WHERE id=$1`,
        [courseId],
      );
    }
  }

  // 8) Forum threads and lesson Q&A -------------------------------------------------
  const hasThread = await one(`SELECT 1 AS ok FROM discussion_threads WHERE deleted_at IS NULL LIMIT 1`);
  if (!hasThread) {
    const threads: Array<[slug: string, title: string, body: string, author: string, replies: Array<[string, string]>]> = [
      [
        'web-development-foundations',
        'When do I use a class versus an ID in CSS?',
        'I understand both select elements, but I am not sure which one to reach for. Is there a rule of thumb?',
        leadStudentId,
        [
          [otherStudentIds[0], 'Classes for anything that can repeat, IDs for something that appears exactly once on a page.'],
          [instructorUserIds.rina, 'That is the right instinct. In practice I use classes almost everywhere — IDs mainly for anchor links and form labels.'],
        ],
      ],
      [
        'web-development-foundations',
        'Which editor do you recommend for a beginner?',
        'Is there an editor that will not overwhelm me on day one?',
        otherStudentIds[1],
        [[instructorUserIds.rina, 'VS Code, and add the Live Server extension. That combination covers everything in this course.']],
      ],
      [
        'react-from-scratch',
        '"Cannot read properties of undefined" when rendering a list',
        'My component crashes on the first render but works after a refresh. What am I missing?',
        leadStudentId,
        [[instructorUserIds.rina, 'The data has not arrived yet on that first render. Guard with optional chaining, or return your loading state before touching the array.']],
      ],
      [
        'node-express-backend',
        'Should I hash passwords in the controller or the service?',
        'Trying to work out where this belongs so the code stays tidy.',
        otherStudentIds[2],
        [[instructorUserIds.daniel, 'The service. Controllers should only translate HTTP to and from your domain — anything security-related belongs behind that line.']],
      ],
    ];

    for (const [slug, title, body, author, replies] of threads) {
      const th = await one<{ id: string }>(
        `INSERT INTO discussion_threads (course_id, judul, dibuat_oleh) VALUES ($1,$2,$3) RETURNING id`,
        [courseIds[slug], title, author],
      );
      await q(`INSERT INTO discussion_posts (thread_id, user_id, isi) VALUES ($1,$2,$3)`, [th!.id, author, body]);
      for (const [uid, text] of replies) {
        await q(`INSERT INTO discussion_posts (thread_id, user_id, isi) VALUES ($1,$2,$3)`, [th!.id, uid, text]);
      }
      await q(
        `UPDATE discussion_threads SET jumlah_post =
           (SELECT COUNT(*) FROM discussion_posts WHERE thread_id=$1 AND deleted_at IS NULL) WHERE id=$1`,
        [th!.id],
      );
    }

    const firstLessons = await pool.query<{ id: string }>(
      `SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id
        WHERE s.course_id=$1 AND l.deleted_at IS NULL ORDER BY s.urutan, l.urutan LIMIT 3`,
      [courseIds['web-development-foundations']],
    );

    const qa: Array<[asker: string, question: string, answerer: string | null, answer: string | null]> = [
      [leadStudentId, 'Do I need to redo this section if I already know the basics?', instructorUserIds.rina, 'No need to watch it again, but do the practice exercise at the end — that is where most of the value is.'],
      [otherStudentIds[2], 'Does any of the software in this course cost money?', instructorUserIds.rina, 'Everything used here is free. Nothing in the course requires a paid licence.'],
      [otherStudentIds[3], 'Roughly how long should this module take?', null, null],
    ];

    let qi = 0;
    for (const [asker, question, answerer, answer] of qa) {
      const lesson = firstLessons.rows[qi % firstLessons.rows.length];
      const qrow = await one<{ id: string }>(
        `INSERT INTO qa_questions (lesson_id, user_id, isi, status_terjawab) VALUES ($1,$2,$3,$4) RETURNING id`,
        [lesson.id, asker, question, !!answerer],
      );
      if (answerer && answer) {
        await q(
          `INSERT INTO qa_answers (question_id, user_id, isi, is_instruktur_jawaban) VALUES ($1,$2,$3,true)`,
          [qrow!.id, answerer, answer],
        );
      }
      qi++;
    }
  }

  // 9) Live sessions ------------------------------------------------------------------
  const hasLive = await one(`SELECT 1 AS ok FROM live_sessions WHERE deleted_at IS NULL LIMIT 1`);
  if (!hasLive) {
    const sessions: Array<[slug: string, title: string, host: InstructorKey]> = [
      ['web-development-foundations', 'Live Q&A: your first responsive layout', 'rina'],
      ['react-from-scratch', 'Live coding: building a component from scratch', 'rina'],
      ['node-express-backend', 'Live review: API design critique', 'daniel'],
      ['data-science-python', 'Office hours: cleaning a messy dataset together', 'kenji'],
    ];
    for (const [slug, title, host] of sessions) {
      await q(
        `INSERT INTO live_sessions (course_id, judul, deskripsi, penyedia, url_join, host_user_id,
                                    waktu_mulai, waktu_selesai, status, dibuat_oleh)
         VALUES ($1,$2,'A live session with your instructor. Bring questions.','zoom','https://zoom.us/j/demo',$3,
                 now() + interval '2 days', now() + interval '2 days' + interval '90 minutes',
                 'dijadwalkan',$3)`,
        [courseIds[slug], title, instructorUserIds[host]],
      );
    }
  }

  // 10) Finance ----------------------------------------------------------------------
  // Both income and expenses: with expenses at zero the dashboard showed profit
  // identical to revenue, which looks like a broken calculation rather than a demo.
  const categoryFor = async (kode: string, nama: string, jenis: 'pemasukan' | 'pengeluaran') =>
    (await one<{ id: string }>(
      `INSERT INTO kategori_biaya (kode, nama, jenis, deskripsi)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (kode) WHERE deleted_at IS NULL DO UPDATE SET nama = EXCLUDED.nama
       RETURNING id`,
      [kode, nama, jenis, `${nama} (demo data)`],
    ))!.id;

  const hasFinance = await one(
    `SELECT 1 AS ok FROM financial_entries fe JOIN kategori_biaya kb ON kb.id = fe.kategori_id
      WHERE kb.kode = 'DEMO-SALES' LIMIT 1`,
  );

  if (!hasFinance) {
    const salesCat = await categoryFor('DEMO-SALES', 'Course Sales', 'pemasukan');
    const infraCat = await categoryFor('DEMO-INFRA', 'Hosting & Infrastructure', 'pengeluaran');
    const marketingCat = await categoryFor('DEMO-MARKETING', 'Marketing & Advertising', 'pengeluaran');
    const payrollCat = await categoryFor('DEMO-PAYROLL', 'Instructor Payouts', 'pengeluaran');

    const insertEntry = async (
      jenis: 'pemasukan' | 'pengeluaran',
      categoryId: string,
      courseId: string | null,
      amount: number,
      description: string,
    ) =>
      q(
        `INSERT INTO financial_entries (jenis, kategori_id, course_id, nominal, tanggal, periode_bulan, periode_tahun, deskripsi, dicatat_oleh)
         VALUES ($1,$2,$3,$4, CURRENT_DATE,
                 EXTRACT(MONTH FROM CURRENT_DATE)::smallint, EXTRACT(YEAR FROM CURRENT_DATE)::smallint,
                 $5,$6)`,
        [jenis, categoryId, courseId, amount, description, instructorUserIds.rina],
      );

    // Twelve sales across the catalogue, so the revenue tile and the trend both read well.
    const sold = [
      'web-development-foundations', 'react-from-scratch', 'ui-ux-fundamentals',
      'data-science-python', 'digital-marketing-practical', 'node-express-backend',
      'machine-learning-foundations', 'sql-database-design', 'modern-javascript',
      'copywriting-that-sells', 'python-for-beginners', 'figma-for-designers',
    ];
    for (const slug of sold) {
      const course = COURSES.find((c) => c.slug === slug)!;
      await insertEntry('pemasukan', salesCat, courseIds[slug], course.price, `Course sale — ${course.title}`);
    }

    await insertEntry('pengeluaran', infraCat, null, 89, 'VPS, database and object storage');
    await insertEntry('pengeluaran', infraCat, null, 24, 'Email delivery and domain renewal');
    await insertEntry('pengeluaran', marketingCat, null, 150, 'Search and social advertising');
    await insertEntry('pengeluaran', payrollCat, null, 210, 'Instructor revenue share payout');
  }

  // 11) Landing hero -------------------------------------------------------------------
  // Without this the storefront hero renders its empty-state gradient block.
  // A fresh install has no `hero` row at all — the storefront falls back to
  // built-in copy and an empty image, which is the gradient placeholder. Only
  // the image is set here; every text field stays empty so the four translated
  // locales keep supplying the wording.
  const heroRow = await one<{ id: string }>(
    `SELECT id FROM site_content WHERE key = 'hero' AND deleted_at IS NULL`,
  );
  if (heroRow) {
    await q(
      `UPDATE site_content
          SET nilai = jsonb_set(nilai, '{gambar_url}', to_jsonb($2::text)), updated_at = now()
        WHERE id = $1 AND COALESCE(nilai->>'gambar_url', '') IN ('', $2)`,
      [heroRow.id, HERO_URL],
    );
  } else {
    await q(
      `INSERT INTO site_content (key, nilai) VALUES ('hero', $1::jsonb)`,
      [
        JSON.stringify({
          aktif: true,
          badge: {},
          judul_pre: {},
          judul_highlight: {},
          judul_post: {},
          subjudul: {},
          gambar_url: HERO_URL,
          tampilkan_pencarian: true,
          tampilkan_rating: true,
          rating_skor: '4.8',
          rating_teks: {},
          tampilkan_kartu_siswa: true,
          tampilkan_kartu_kursus: true,
        }),
      ],
    );
  }

  // The seeded contact block still carried a placeholder street address that
  // rendered in the storefront footer.
  await q(
    `UPDATE site_content
        SET nilai = jsonb_set(nilai, '{alamat}', $1::jsonb), updated_at = now()
      WHERE key = 'kontak' AND deleted_at IS NULL
        AND nilai->'alamat'->>'en' LIKE '%Merdeka%'`,
    [JSON.stringify({ en: '' })],
  );

  // 12) Make every date current ---------------------------------------------------------
  await refreshDemoTimeline();

  // 13) Commerce history ----------------------------------------------------------------
  // After the timeline, so orders are dated against the enrolment dates it just set.
  await installDemoTransactions();

  logger.info(
    'Demo data ready. Existing accounts keep their password — only the display\n' +
      'name is refreshed, so logins already handed to a reviewer keep working.\n' +
      `   Instructors : ${Object.values(INSTRUCTORS).map((i) => i.email).join(', ')}\n` +
      `   Students    : ${LEAD_STUDENT.email} (+${OTHER_STUDENTS.length} more)\n` +
      '   Password    : Demo12345!\n' +
      `   ${COURSES.length} published courses in English, with generated artwork and locally hosted video\n` +
      '   Currency set to USD · income and expenses dated inside the current month\n' +
      '   Re-run this seeder any time to bring every date back to today',
  );

  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Demo seed failed');
  process.exit(1);
});
