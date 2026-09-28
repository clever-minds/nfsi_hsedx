import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';

export type QuestionTipe =
  | 'pilihan_tunggal'
  | 'pilihan_ganda'
  | 'benar_salah'
  | 'isian_singkat'
  | 'esai'
  | 'upload_file'
  | 'pencocokan';
export type QuizAttemptStatus = 'belum_dikerjakan' | 'sedang' | 'dikumpulkan' | 'dinilai';
export type SubmissionStatus = 'belum' | 'dikumpulkan' | 'dinilai' | 'revisi_diminta';
export type TipePengumpulan = 'file' | 'teks' | 'url' | 'campuran';

export interface QuestionBankRow {
  id: string;
  nama: string;
  course_id: string | null;
  category_id: string | null;
  deskripsi: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionRow {
  id: string;
  question_bank_id: string;
  tipe: QuestionTipe;
  teks_soal: string;
  poin: string;
  penjelasan_jawaban: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionOptionRow {
  id: string;
  question_id: string;
  teks_opsi: string;
  is_benar: boolean;
  pasangan_key: string | null;
  urutan: number;
}

export interface QuizRow {
  id: string;
  course_id: string;
  section_id: string | null;
  lesson_id: string | null;
  judul: string;
  deskripsi: string | null;
  batas_waktu_menit: number | null;
  acak_soal: boolean;
  acak_opsi: boolean;
  attempt_maksimal: number;
  passing_score: string | null;
  tampilkan_jawaban_setelah_selesai: boolean;
  is_aktif: boolean;
  total_poin: string;
  created_at: string;
  updated_at: string;
  /** Terisi pada query list (JOIN courses) untuk kolom "Kursus" di FE. */
  kursus_judul?: string | null;
  /** Terisi pada list untuk siswa: status/nilai attempt miliknya. */
  attempt_status?: string | null;
  skor_terbaik?: string | null;
  attempt_terpakai?: number | null;
}

export interface QuizQuestionRow {
  id: string;
  quiz_id: string;
  question_id: string;
  urutan: number;
  poin_override: string | null;
}

export interface AssignmentRow {
  id: string;
  course_id: string;
  section_id: string | null;
  lesson_id: string | null;
  judul: string;
  instruksi: string;
  tenggat_at: string | null;
  tipe_pengumpulan: TipePengumpulan;
  maksimal_ukuran_mb: number | null;
  poin_maksimal: string;
  is_aktif: boolean;
  created_at: string;
  updated_at: string;
  /** Terisi pada query list (JOIN courses) untuk kolom "Kursus" di FE. */
  kursus_judul?: string | null;
  /** Terisi pada list untuk siswa: status submission miliknya. */
  submission_status?: string | null;
  dikumpulkan_at?: string | null;
}

export interface RubricRow {
  id: string;
  assignment_id: string;
  kriteria: Array<{ nama: string; bobot: number; deskripsi_level?: string }>;
  created_at: string;
  updated_at: string;
}

export interface QuizAttemptRow {
  id: string;
  enrollment_id: string;
  quiz_id: string;
  attempt_ke: number;
  status: QuizAttemptStatus;
  skor: string | null;
  mulai_at: string | null;
  selesai_at: string | null;
  waktu_tersisa_detik: number | null;
  created_at: string;
}

export interface AttemptAnswerRow {
  id: string;
  quiz_attempt_id: string;
  question_id: string;
  jawaban: unknown;
  skor_didapat: string | null;
  is_benar: boolean | null;
  dinilai_manual: boolean;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  enrollment_id: string;
  assignment_id: string;
  status: SubmissionStatus;
  isi_teks: string | null;
  file_media_id: string | null;
  url: string | null;
  dikumpulkan_at: string | null;
  revisi_ke: number;
  catatan_revisi: string | null;
  created_at: string;
  updated_at: string;
}

// ── Question Banks ──────────────────────────────────────

export async function listQuestionBanks(f: { course_id?: string; category_id?: string; ownerUserId?: string | null }) {
  const where: string[] = ['qb.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, v: unknown) => {
    params.push(v);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.course_id) add('qb.course_id = $?', f.course_id);
  if (f.category_id) add('qb.category_id = $?', f.category_id);
  if (f.ownerUserId) {
    add(
      'qb.course_id IN (SELECT c.id FROM courses c WHERE c.instructor_id IN (SELECT id FROM instructor_profiles WHERE user_id = $?))',
      f.ownerUserId,
    );
  }
  return query<QuestionBankRow>(
    `SELECT qb.* FROM question_banks qb WHERE ${where.join(' AND ')} ORDER BY qb.created_at DESC`,
    params,
  );
}

export async function questionBankDetail(id: string): Promise<QuestionBankRow | null> {
  return queryOne<QuestionBankRow>(`SELECT * FROM question_banks WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertQuestionBank(data: {
  nama: string;
  course_id: string | null;
  category_id: string | null;
  deskripsi: string | null;
  created_by: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO question_banks (nama, course_id, category_id, deskripsi, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.nama, data.course_id, data.category_id, data.deskripsi, data.created_by],
  );
  return row!;
}

export async function updateQuestionBank(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE question_banks SET ${set}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteQuestionBank(id: string): Promise<void> {
  await query(`UPDATE question_banks SET deleted_at = now() WHERE id = $1`, [id]);
}

// ── Questions & Options ─────────────────────────────────

export async function listQuestions(bankId: string): Promise<QuestionRow[]> {
  return query<QuestionRow>(
    `SELECT * FROM questions WHERE question_bank_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [bankId],
  );
}

export async function questionDetail(id: string): Promise<QuestionRow | null> {
  return queryOne<QuestionRow>(`SELECT * FROM questions WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function listOptions(questionId: string, tx?: PoolClient): Promise<QuestionOptionRow[]> {
  const runner = tx ?? pool;
  const res = await runner.query<QuestionOptionRow>(
    `SELECT * FROM question_options WHERE question_id = $1 ORDER BY urutan`,
    [questionId],
  );
  return res.rows;
}

export async function insertQuestion(
  data: { question_bank_id: string; tipe: QuestionTipe; teks_soal: string; poin: number; penjelasan_jawaban: string | null; meta: unknown },
  tx?: PoolClient,
): Promise<{ id: string }> {
  const runner = tx ?? pool;
  const res = await runner.query<{ id: string }>(
    `INSERT INTO questions (question_bank_id, tipe, teks_soal, poin, penjelasan_jawaban, meta)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.question_bank_id, data.tipe, data.teks_soal, data.poin, data.penjelasan_jawaban, data.meta ? JSON.stringify(data.meta) : null],
  );
  return res.rows[0];
}

export async function updateQuestion(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE questions SET ${set}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteQuestion(id: string): Promise<void> {
  await query(`UPDATE questions SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function replaceOptions(
  questionId: string,
  options: Array<{ teks_opsi: string; is_benar: boolean; pasangan_key: string | null; urutan: number }>,
  tx?: PoolClient,
): Promise<void> {
  const runner = tx ?? pool;
  await runner.query(`DELETE FROM question_options WHERE question_id = $1`, [questionId]);
  for (const o of options) {
    await runner.query(
      `INSERT INTO question_options (question_id, teks_opsi, is_benar, pasangan_key, urutan) VALUES ($1,$2,$3,$4,$5)`,
      [questionId, o.teks_opsi, o.is_benar, o.pasangan_key, o.urutan],
    );
  }
}

export async function questionOwnerCourseId(questionId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string | null }>(
    `SELECT qb.course_id FROM questions q JOIN question_banks qb ON qb.id = q.question_bank_id WHERE q.id = $1`,
    [questionId],
  );
  return row?.course_id ?? null;
}

// ── Quizzes ──────────────────────────────────────────────

export async function listQuizzes(f: {
  course_id?: string;
  ownerUserId?: string | null;
  enrolledUserId?: string | null;
}) {
  const where: string[] = ['qz.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.course_id) {
    params.push(f.course_id);
    where.push(`qz.course_id = $${params.length}`);
  }
  if (f.ownerUserId) {
    params.push(f.ownerUserId);
    where.push(`qz.course_id IN (SELECT c.id FROM courses c WHERE c.instructor_id IN (SELECT id FROM instructor_profiles WHERE user_id = $${params.length}))`);
  }
  // Cakupan siswa: hanya kuis AKTIF dari kursus yang enrollment-nya aktif/terdaftar.
  if (f.enrolledUserId) {
    params.push(f.enrolledUserId);
    where.push(
      `qz.is_aktif = true AND qz.course_id IN (SELECT e.course_id FROM enrollments e WHERE e.user_id = $${params.length} AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))`,
    );
  }
  return query<QuizRow>(
    `SELECT qz.*, c.judul AS kursus_judul
       FROM quizzes qz JOIN courses c ON c.id = qz.course_id
      WHERE ${where.join(' AND ')} ORDER BY qz.created_at DESC`,
    params,
  );
}

/**
 * Daftar kuis untuk SISWA: hanya kuis aktif dari kursus yang diikuti, dilengkapi
 * status & nilai attempt miliknya (untuk kolom "Status" yang benar, bukan "draft").
 */
export async function listQuizzesForStudent(userId: string, courseId?: string) {
  const params: unknown[] = [userId];
  let courseFilter = '';
  if (courseId) {
    params.push(courseId);
    courseFilter = `AND qz.course_id = $${params.length}`;
  }
  return query<QuizRow>(
    `SELECT qz.*, c.judul AS kursus_judul,
            latest.status AS attempt_status,
            best.skor AS skor_terbaik,
            cnt.jumlah AS attempt_terpakai
       FROM quizzes qz
       JOIN courses c ON c.id = qz.course_id
       JOIN enrollments e ON e.course_id = qz.course_id AND e.user_id = $1
            AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif')
       LEFT JOIN LATERAL (
         SELECT qa.status FROM quiz_attempts qa
          WHERE qa.quiz_id = qz.id AND qa.enrollment_id = e.id
          ORDER BY CASE qa.status WHEN 'dinilai' THEN 3 WHEN 'dikumpulkan' THEN 2 WHEN 'sedang' THEN 1 ELSE 0 END DESC
          LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT max(qa.skor) AS skor FROM quiz_attempts qa
          WHERE qa.quiz_id = qz.id AND qa.enrollment_id = e.id
       ) best ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS jumlah FROM quiz_attempts qa
          WHERE qa.quiz_id = qz.id AND qa.enrollment_id = e.id
       ) cnt ON true
      WHERE qz.deleted_at IS NULL AND qz.is_aktif = true ${courseFilter}
      ORDER BY qz.created_at DESC`,
    params,
  );
}

export async function quizDetail(id: string): Promise<QuizRow | null> {
  return queryOne<QuizRow>(`SELECT * FROM quizzes WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertQuiz(data: Omit<QuizRow, 'id' | 'total_poin' | 'created_at' | 'updated_at'>): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO quizzes (course_id, section_id, lesson_id, judul, deskripsi, batas_waktu_menit, acak_soal, acak_opsi,
                           attempt_maksimal, passing_score, tampilkan_jawaban_setelah_selesai, is_aktif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      data.course_id,
      data.section_id,
      data.lesson_id,
      data.judul,
      data.deskripsi,
      data.batas_waktu_menit,
      data.acak_soal,
      data.acak_opsi,
      data.attempt_maksimal,
      data.passing_score,
      data.tampilkan_jawaban_setelah_selesai,
      data.is_aktif,
    ],
  );
  return row!;
}

export async function updateQuiz(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE quizzes SET ${set}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteQuiz(id: string): Promise<void> {
  await query(`UPDATE quizzes SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function replaceQuizQuestions(
  quizId: string,
  items: Array<{ question_id: string; urutan: number; poin_override: number | null }>,
): Promise<void> {
  await query(`DELETE FROM quiz_questions WHERE quiz_id = $1`, [quizId]);
  let totalPoin = 0;
  for (const it of items) {
    await query(
      `INSERT INTO quiz_questions (quiz_id, question_id, urutan, poin_override) VALUES ($1,$2,$3,$4)`,
      [quizId, it.question_id, it.urutan, it.poin_override],
    );
    const q = await queryOne<{ poin: string }>(`SELECT poin FROM questions WHERE id = $1`, [it.question_id]);
    totalPoin += it.poin_override ?? Number(q?.poin ?? 0);
  }
  await query(`UPDATE quizzes SET total_poin = $2, updated_at = now() WHERE id = $1`, [quizId, totalPoin]);
}

export async function quizQuestionsWithOptions(
  quizId: string,
): Promise<Array<QuizQuestionRow & { question: QuestionRow; options: QuestionOptionRow[] }>> {
  const links = await query<QuizQuestionRow>(`SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY urutan`, [quizId]);
  const result: Array<QuizQuestionRow & { question: QuestionRow; options: QuestionOptionRow[] }> = [];
  for (const link of links) {
    const question = await questionDetail(link.question_id);
    if (!question) continue;
    const options = await listOptions(link.question_id);
    result.push({ ...link, question, options });
  }
  return result;
}

// ── Assignments & Rubrics ───────────────────────────────

export async function listAssignments(f: {
  course_id?: string;
  ownerUserId?: string | null;
  enrolledUserId?: string | null;
}) {
  const where: string[] = ['a.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.course_id) {
    params.push(f.course_id);
    where.push(`a.course_id = $${params.length}`);
  }
  if (f.ownerUserId) {
    params.push(f.ownerUserId);
    where.push(`a.course_id IN (SELECT c.id FROM courses c WHERE c.instructor_id IN (SELECT id FROM instructor_profiles WHERE user_id = $${params.length}))`);
  }
  // Cakupan siswa: hanya tugas dari kursus yang enrollment-nya aktif/terdaftar.
  if (f.enrolledUserId) {
    params.push(f.enrolledUserId);
    where.push(
      `a.course_id IN (SELECT e.course_id FROM enrollments e WHERE e.user_id = $${params.length} AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))`,
    );
  }
  return query<AssignmentRow>(
    `SELECT a.*, c.judul AS kursus_judul
       FROM assignments a JOIN courses c ON c.id = a.course_id
      WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC`,
    params,
  );
}

/**
 * Daftar tugas untuk SISWA: hanya tugas dari kursus yang diikuti, dilengkapi
 * status submission miliknya (Belum dikumpulkan / Terkumpul / Dinilai / Revisi).
 */
export async function listAssignmentsForStudent(userId: string, courseId?: string) {
  const params: unknown[] = [userId];
  let courseFilter = '';
  if (courseId) {
    params.push(courseId);
    courseFilter = `AND a.course_id = $${params.length}`;
  }
  return query<AssignmentRow>(
    `SELECT a.*, c.judul AS kursus_judul,
            COALESCE(s.status, 'belum') AS submission_status,
            s.dikumpulkan_at
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       JOIN enrollments e ON e.course_id = a.course_id AND e.user_id = $1
            AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif')
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.enrollment_id = e.id AND s.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.is_aktif = true ${courseFilter}
      ORDER BY a.created_at DESC`,
    params,
  );
}

export async function assignmentDetail(id: string): Promise<AssignmentRow | null> {
  return queryOne<AssignmentRow>(`SELECT * FROM assignments WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertAssignment(data: Omit<AssignmentRow, 'id' | 'created_at' | 'updated_at'>): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO assignments (course_id, section_id, lesson_id, judul, instruksi, tenggat_at, tipe_pengumpulan,
                               maksimal_ukuran_mb, poin_maksimal, is_aktif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      data.course_id,
      data.section_id,
      data.lesson_id,
      data.judul,
      data.instruksi,
      data.tenggat_at,
      data.tipe_pengumpulan,
      data.maksimal_ukuran_mb,
      data.poin_maksimal,
      data.is_aktif,
    ],
  );
  return row!;
}

export async function updateAssignment(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE assignments SET ${set}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteAssignment(id: string): Promise<void> {
  await query(`UPDATE assignments SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function rubricByAssignment(assignmentId: string): Promise<RubricRow | null> {
  return queryOne<RubricRow>(`SELECT * FROM rubrics WHERE assignment_id = $1 AND deleted_at IS NULL`, [assignmentId]);
}

export async function upsertRubric(assignmentId: string, kriteria: unknown): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO rubrics (assignment_id, kriteria) VALUES ($1,$2)
     ON CONFLICT (assignment_id) DO UPDATE SET kriteria = EXCLUDED.kriteria, updated_at = now()
     RETURNING id`,
    [assignmentId, JSON.stringify(kriteria)],
  );
  return row!;
}

// ── Quiz Attempts & Answers ─────────────────────────────

export async function countAttempts(enrollmentId: string, quizId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE enrollment_id = $1 AND quiz_id = $2`,
    [enrollmentId, quizId],
  );
  return Number(row?.count ?? 0);
}

export async function insertAttempt(data: {
  enrollment_id: string;
  quiz_id: string;
  attempt_ke: number;
  waktu_tersisa_detik: number | null;
}): Promise<QuizAttemptRow> {
  const row = await queryOne<QuizAttemptRow>(
    `INSERT INTO quiz_attempts (enrollment_id, quiz_id, attempt_ke, status, mulai_at, waktu_tersisa_detik)
     VALUES ($1,$2,$3,'sedang', now(), $4) RETURNING *`,
    [data.enrollment_id, data.quiz_id, data.attempt_ke, data.waktu_tersisa_detik],
  );
  return row!;
}

export async function attemptDetail(id: string): Promise<QuizAttemptRow | null> {
  return queryOne<QuizAttemptRow>(`SELECT * FROM quiz_attempts WHERE id = $1`, [id]);
}

export async function updateAttempt(id: string, fields: Record<string, unknown>, tx?: PoolClient): Promise<void> {
  const runner = tx ?? pool;
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await runner.query(`UPDATE quiz_attempts SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function upsertAnswer(attemptId: string, questionId: string, jawaban: unknown): Promise<AttemptAnswerRow> {
  const row = await queryOne<AttemptAnswerRow>(
    `INSERT INTO attempt_answers (quiz_attempt_id, question_id, jawaban) VALUES ($1,$2,$3)
     ON CONFLICT (quiz_attempt_id, question_id) DO UPDATE SET jawaban = EXCLUDED.jawaban
     RETURNING *`,
    [attemptId, questionId, JSON.stringify(jawaban)],
  );
  return row!;
}

export async function listAnswers(attemptId: string, tx?: PoolClient): Promise<AttemptAnswerRow[]> {
  const runner = tx ?? pool;
  const res = await runner.query<AttemptAnswerRow>(`SELECT * FROM attempt_answers WHERE quiz_attempt_id = $1`, [attemptId]);
  return res.rows;
}

export async function updateAnswerGrading(
  id: string,
  data: { skor_didapat: number | null; is_benar: boolean | null; dinilai_manual: boolean },
  tx: PoolClient,
): Promise<void> {
  await tx.query(`UPDATE attempt_answers SET skor_didapat = $2, is_benar = $3, dinilai_manual = $4 WHERE id = $1`, [
    id,
    data.skor_didapat,
    data.is_benar,
    data.dinilai_manual,
  ]);
}

// ── Submissions ──────────────────────────────────────────

export async function findSubmission(enrollmentId: string, assignmentId: string): Promise<SubmissionRow | null> {
  return queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE enrollment_id = $1 AND assignment_id = $2`, [
    enrollmentId,
    assignmentId,
  ]);
}

export async function submissionDetail(id: string): Promise<SubmissionRow | null> {
  return queryOne<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
}

export async function insertSubmission(data: {
  enrollment_id: string;
  assignment_id: string;
  isi_teks: string | null;
  file_media_id: string | null;
  url: string | null;
}): Promise<SubmissionRow> {
  const row = await queryOne<SubmissionRow>(
    `INSERT INTO submissions (enrollment_id, assignment_id, status, isi_teks, file_media_id, url, dikumpulkan_at)
     VALUES ($1,$2,'dikumpulkan',$3,$4,$5, now()) RETURNING *`,
    [data.enrollment_id, data.assignment_id, data.isi_teks, data.file_media_id, data.url],
  );
  return row!;
}

export async function resubmit(
  id: string,
  data: { isi_teks: string | null; file_media_id: string | null; url: string | null },
): Promise<SubmissionRow> {
  const row = await queryOne<SubmissionRow>(
    `UPDATE submissions SET status = 'dikumpulkan', isi_teks = $2, file_media_id = $3, url = $4,
            dikumpulkan_at = now(), revisi_ke = revisi_ke + 1, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, data.isi_teks, data.file_media_id, data.url],
  );
  return row!;
}

export async function listSubmissionsForAssignment(assignmentId: string): Promise<SubmissionRow[]> {
  return query<SubmissionRow>(`SELECT * FROM submissions WHERE assignment_id = $1 AND deleted_at IS NULL ORDER BY dikumpulkan_at DESC`, [
    assignmentId,
  ]);
}

export async function setSubmissionRevision(id: string, catatan: string): Promise<void> {
  await query(`UPDATE submissions SET status = 'revisi_diminta', catatan_revisi = $2, updated_at = now() WHERE id = $1`, [id, catatan]);
}

export async function setSubmissionStatus(id: string, status: SubmissionStatus, tx?: PoolClient): Promise<void> {
  const runner = tx ?? pool;
  await runner.query(`UPDATE submissions SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

/** Row-level: cek instruktur pemilik kursus (courses.instructor_id -> instructor_profiles.user_id). */
export async function isCourseOwnedByInstructor(courseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE c.id = $1 AND ip.user_id = $2
     ) AS ok`,
    [courseId, userId],
  );
  return row?.ok ?? false;
}
