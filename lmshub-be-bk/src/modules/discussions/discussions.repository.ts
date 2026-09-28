import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

export interface ThreadRow {
  id: string;
  course_id: string;
  judul: string;
  dibuat_oleh: string;
  penulis_nama?: string; // di-join saat list/detail
  penulis_foto?: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  jumlah_post: number;
  created_at: string;
  updated_at: string;
}

export interface PostRow {
  id: string;
  thread_id: string;
  parent_post_id: string | null;
  user_id: string;
  penulis_nama?: string; // di-join saat listPosts
  penulis_foto?: string | null;
  isi: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface QaAnswerLite {
  id: string;
  isi: string;
  penjawab_nama: string;
  is_instruktur_jawaban: boolean;
  jumlah_upvote: number;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  lesson_id: string;
  user_id: string;
  penanya_nama?: string; // di-join saat listQuestions
  penanya_foto?: string | null;
  isi: string;
  status_terjawab: boolean;
  jumlah_upvote: number;
  is_hidden: boolean;
  jawaban?: QaAnswerLite[]; // di-agregasi saat listQuestions
  created_at: string;
  updated_at: string;
}

export interface AnswerRow {
  id: string;
  question_id: string;
  user_id: string;
  isi: string;
  is_instruktur_jawaban: boolean;
  jumlah_upvote: number;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  target_type: string;
  target_id: string;
  user_id: string;
  isi: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReactionRow {
  id: string;
  target_type: string;
  target_id: string;
  user_id: string;
  jenis: string;
  created_at: string;
}

export interface ReportRow {
  id: string;
  target_type: string;
  target_id: string;
  pelapor_user_id: string;
  alasan: string;
  status: 'menunggu' | 'ditinjau' | 'ditindak' | 'ditolak';
  tindakan: 'sembunyikan' | 'hapus' | 'blokir_pengguna' | null;
  ditangani_oleh: string | null;
  catatan_penanganan: string | null;
  ditangani_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Membership helpers (course scope) ─────────────────────

export async function courseIdOfLesson(lessonId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string }>(
    `SELECT s.course_id FROM lessons l JOIN sections s ON s.id = l.section_id WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [lessonId],
  );
  return row?.course_id ?? null;
}

export async function isCourseMember(courseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = $1 AND e.user_id = $2 AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif','selesai'))
       OR EXISTS (SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id WHERE c.id = $1 AND ip.user_id = $2)
     ) AS ok`,
    [courseId, userId],
  );
  return row?.ok ?? false;
}

export async function isCourseInstructor(courseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE c.id = $1 AND ip.user_id = $2
     ) AS ok`,
    [courseId, userId],
  );
  return row?.ok ?? false;
}

/** Resolusi best-effort course_id dari target polymorphic (untuk validasi keanggotaan pada moderasi/reaksi/komentar). */
export async function courseIdOfTarget(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === 'discussion_post') {
    const row = await queryOne<{ course_id: string }>(
      `SELECT t.course_id FROM discussion_posts p JOIN discussion_threads t ON t.id = p.thread_id WHERE p.id = $1`,
      [targetId],
    );
    return row?.course_id ?? null;
  }
  if (targetType === 'qa_question') {
    const row = await queryOne<{ lesson_id: string }>(`SELECT lesson_id FROM qa_questions WHERE id = $1`, [targetId]);
    return row ? courseIdOfLesson(row.lesson_id) : null;
  }
  if (targetType === 'qa_answer') {
    const row = await queryOne<{ lesson_id: string }>(
      `SELECT q.lesson_id FROM qa_answers a JOIN qa_questions q ON q.id = a.question_id WHERE a.id = $1`,
      [targetId],
    );
    return row ? courseIdOfLesson(row.lesson_id) : null;
  }
  return null; // comment/lesson_content: dicek longgar (sudah gated permission diskusi.*)
}

// ── Threads & posts ────────────────────────────────────────

export async function listThreads(courseId: string, p: PageParams): Promise<{ rows: ThreadRow[]; total: number }> {
  const rows = await query<ThreadRow>(
    `SELECT t.*, u.nama_lengkap AS penulis_nama, u.foto_profil AS penulis_foto
       FROM discussion_threads t
       JOIN users u ON u.id = t.dibuat_oleh
      WHERE t.course_id = $1 AND t.deleted_at IS NULL
      ORDER BY t.is_pinned DESC, t.created_at DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    [courseId],
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM discussion_threads WHERE course_id = $1 AND deleted_at IS NULL`,
    [courseId],
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getThread(id: string): Promise<ThreadRow | null> {
  return queryOne<ThreadRow>(`SELECT * FROM discussion_threads WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertThread(data: { course_id: string; judul: string; dibuat_oleh: string }): Promise<ThreadRow> {
  const row = await queryOne<ThreadRow>(
    `INSERT INTO discussion_threads (course_id, judul, dibuat_oleh) VALUES ($1,$2,$3) RETURNING *`,
    [data.course_id, data.judul, data.dibuat_oleh],
  );
  return row!;
}

export async function setThreadPin(id: string, pinned: boolean): Promise<void> {
  await query(`UPDATE discussion_threads SET is_pinned = $2 WHERE id = $1`, [id, pinned]);
}

export async function setThreadLock(id: string, locked: boolean): Promise<void> {
  await query(`UPDATE discussion_threads SET is_locked = $2 WHERE id = $1`, [id, locked]);
}

export async function incrementThreadPostCount(id: string): Promise<void> {
  await query(`UPDATE discussion_threads SET jumlah_post = jumlah_post + 1 WHERE id = $1`, [id]);
}

export async function listPosts(threadId: string): Promise<PostRow[]> {
  return query<PostRow>(
    `SELECT p.*, u.nama_lengkap AS penulis_nama, u.foto_profil AS penulis_foto
       FROM discussion_posts p
       JOIN users u ON u.id = p.user_id
      WHERE p.thread_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at ASC`,
    [threadId],
  );
}

export async function insertPost(data: {
  thread_id: string;
  parent_post_id: string | null;
  user_id: string;
  isi: string;
}): Promise<PostRow> {
  const row = await queryOne<PostRow>(
    `INSERT INTO discussion_posts (thread_id, parent_post_id, user_id, isi) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.thread_id, data.parent_post_id, data.user_id, data.isi],
  );
  return row!;
}

export async function getPost(id: string): Promise<PostRow | null> {
  return queryOne<PostRow>(`SELECT * FROM discussion_posts WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

// ── Q&A ─────────────────────────────────────────────────────

export async function listQuestions(lessonId: string, p: PageParams): Promise<{ rows: QuestionRow[]; total: number }> {
  const rows = await query<QuestionRow>(
    `SELECT q.*, u.nama_lengkap AS penanya_nama, u.foto_profil AS penanya_foto,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'id', a.id, 'isi', a.isi, 'penjawab_nama', au.nama_lengkap,
                        'is_instruktur_jawaban', a.is_instruktur_jawaban,
                        'jumlah_upvote', a.jumlah_upvote, 'created_at', a.created_at)
                        ORDER BY a.is_instruktur_jawaban DESC, a.created_at ASC)
                 FROM qa_answers a JOIN users au ON au.id = a.user_id
                WHERE a.question_id = q.id AND a.deleted_at IS NULL AND a.is_hidden = false),
              '[]'::json) AS jawaban
       FROM qa_questions q
       JOIN users u ON u.id = q.user_id
      WHERE q.lesson_id = $1 AND q.deleted_at IS NULL
      ORDER BY q.created_at DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    [lessonId],
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM qa_questions WHERE lesson_id = $1 AND deleted_at IS NULL`,
    [lessonId],
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getQuestion(id: string): Promise<QuestionRow | null> {
  return queryOne<QuestionRow>(`SELECT * FROM qa_questions WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertQuestion(data: { lesson_id: string; user_id: string; isi: string }): Promise<QuestionRow> {
  const row = await queryOne<QuestionRow>(
    `INSERT INTO qa_questions (lesson_id, user_id, isi) VALUES ($1,$2,$3) RETURNING *`,
    [data.lesson_id, data.user_id, data.isi],
  );
  return row!;
}

export async function setQuestionAnswered(id: string, answered: boolean): Promise<void> {
  await query(`UPDATE qa_questions SET status_terjawab = $2 WHERE id = $1`, [id, answered]);
}

export async function insertAnswer(data: {
  question_id: string;
  user_id: string;
  isi: string;
  is_instruktur_jawaban: boolean;
}): Promise<AnswerRow> {
  const row = await queryOne<AnswerRow>(
    `INSERT INTO qa_answers (question_id, user_id, isi, is_instruktur_jawaban) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.question_id, data.user_id, data.isi, data.is_instruktur_jawaban],
  );
  return row!;
}

export async function listAnswers(questionId: string): Promise<AnswerRow[]> {
  return query<AnswerRow>(
    `SELECT * FROM qa_answers WHERE question_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [questionId],
  );
}

export async function getAnswer(id: string): Promise<AnswerRow | null> {
  return queryOne<AnswerRow>(`SELECT * FROM qa_answers WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

// ── Comments ──────────────────────────────────────────────

export async function insertComment(data: {
  target_type: string;
  target_id: string;
  user_id: string;
  isi: string;
}): Promise<CommentRow> {
  const row = await queryOne<CommentRow>(
    `INSERT INTO comments (target_type, target_id, user_id, isi) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.target_type, data.target_id, data.user_id, data.isi],
  );
  return row!;
}

// ── Reactions (toggle upvote/like) ─────────────────────────

export async function findReaction(targetType: string, targetId: string, userId: string): Promise<ReactionRow | null> {
  return queryOne<ReactionRow>(
    `SELECT * FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3`,
    [targetType, targetId, userId],
  );
}

export async function insertReaction(data: {
  target_type: string;
  target_id: string;
  user_id: string;
  jenis: string;
}): Promise<ReactionRow> {
  const row = await queryOne<ReactionRow>(
    `INSERT INTO reactions (target_type, target_id, user_id, jenis) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.target_type, data.target_id, data.user_id, data.jenis],
  );
  return row!;
}

export async function deleteReaction(id: string): Promise<void> {
  await query(`DELETE FROM reactions WHERE id = $1`, [id]);
}

export async function incrementUpvote(table: 'qa_questions' | 'qa_answers', id: string, delta: number): Promise<void> {
  await query(`UPDATE ${table} SET jumlah_upvote = GREATEST(0, jumlah_upvote + $2) WHERE id = $1`, [id, delta]);
}

// ── Moderation ──────────────────────────────────────────────

export async function insertReport(data: {
  target_type: string;
  target_id: string;
  pelapor_user_id: string;
  alasan: string;
}): Promise<ReportRow> {
  const row = await queryOne<ReportRow>(
    `INSERT INTO moderation_reports (target_type, target_id, pelapor_user_id, alasan) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.target_type, data.target_id, data.pelapor_user_id, data.alasan],
  );
  return row!;
}

export async function findDuplicateReport(targetType: string, targetId: string, pelaporUserId: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(
    `SELECT * FROM moderation_reports WHERE target_type = $1 AND target_id = $2 AND pelapor_user_id = $3
       AND status IN ('menunggu','ditinjau') AND deleted_at IS NULL`,
    [targetType, targetId, pelaporUserId],
  );
}

export async function countPendingReportsForTarget(targetType: string, targetId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM moderation_reports
      WHERE target_type = $1 AND target_id = $2 AND status IN ('menunggu','ditinjau') AND deleted_at IS NULL`,
    [targetType, targetId],
  );
  return Number(row?.count ?? 0);
}

export async function listReports(p: PageParams, status?: string): Promise<{ rows: ReportRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const rows = await query<ReportRow>(
    `SELECT * FROM moderation_reports WHERE ${whereSql} ORDER BY created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM moderation_reports WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getReport(id: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(`SELECT * FROM moderation_reports WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function actOnReport(
  id: string,
  data: { status: string; tindakan: string | null; ditangani_oleh: string; catatan_penanganan: string | null },
): Promise<ReportRow> {
  const row = await queryOne<ReportRow>(
    `UPDATE moderation_reports
        SET status = $2, tindakan = $3, ditangani_oleh = $4, catatan_penanganan = $5, ditangani_at = now()
      WHERE id = $1 RETURNING *`,
    [id, data.status, data.tindakan, data.ditangani_oleh, data.catatan_penanganan],
  );
  return row!;
}

const TARGET_TABLE: Record<string, string> = {
  discussion_post: 'discussion_posts',
  qa_question: 'qa_questions',
  qa_answer: 'qa_answers',
  comment: 'comments',
};

export async function hideTarget(targetType: string, targetId: string, reason: string | null): Promise<void> {
  const table = TARGET_TABLE[targetType];
  if (!table) return;
  if (table === 'discussion_posts') {
    await query(`UPDATE ${table} SET is_hidden = true, hidden_reason = $2 WHERE id = $1`, [targetId, reason]);
  } else {
    await query(`UPDATE ${table} SET is_hidden = true WHERE id = $1`, [targetId]);
  }
}

export async function softDeleteTarget(targetType: string, targetId: string): Promise<void> {
  const table = TARGET_TABLE[targetType];
  if (!table) return;
  await query(`UPDATE ${table} SET deleted_at = now() WHERE id = $1`, [targetId]);
}
