import { pool } from '../core/db/pool';
import { hashPassword } from '../core/auth/password';
import { logger } from '../core/logger/logger';

/**
 * Seeder DEV — memberi satu akun siswa 3 kuis siap dikerjakan ("coba-coba").
 *
 * Idempoten: aman dijalankan berkali-kali. Membuat (bila belum ada):
 * - 1 instruktur dev pemilik kursus/kuis
 * - 3 kursus terbit (slug dev-quiz-*) + enrollment AKTIF milik siswa
 * - 1 kuis aktif per kursus (4 soal pilihan tunggal + opsi), attempt maks 3
 *
 * Kenapa perlu enrollment aktif? Memulai attempt kuis (POST /quizzes/:id/attempts)
 * memvalidasi siswa punya akses aktif ke kursus kuis tsb (assessments.service).
 *
 * Jalankan: npm run seed:siswa-quiz (target default: siti@lmshub.test)
 * npm run seed:siswa-quiz -- email@siswa.test (target lain)
 */

const TARGET_EMAIL = (process.argv[2] || process.env.SISWA_EMAIL || 'siti@lmshub.test').toLowerCase();
const TARGET_NAMA = 'Quiz Test Student';
const DEV_PASSWORD = 'Demo12345!';

const q = pool.query.bind(pool);
async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}

/** [teksSoal, [opsi...], indexJawabanBenar] */
type Soal = [string, string[], number];

interface QuizSpec {
  slug: string;
  kursus: string;
  quiz: string;
  soal: Soal[];
}

const QUIZ_SPECS: QuizSpec[] = [
  {
    slug: 'dev-quiz-html-css',
    kursus: 'HTML & CSS Basics (Dev)',
    quiz: 'HTML & CSS Basics Quiz',
    soal: [
      ['Which HTML tag creates a link?', ['<link>', '<a>', '<href>', '<url>'], 1],
      ['Which CSS property sets the text colour?', ['background', 'font', 'color', 'text-fill'], 2],
      ['What does CSS stand for?', ['Computer Style Sheets', 'Cascading Style Sheets', 'Creative Style System', 'Colorful Style Sheets'], 1],
      ['Which tag creates an ordered list?', ['<ul>', '<ol>', '<li>', '<list>'], 1],
    ],
  },
  {
    slug: 'dev-quiz-logika',
    kursus: 'Programming Logic (Dev)',
    quiz: 'Programming Logic Quiz',
    soal: [
      ['What is a structure that repeats instructions called?', ['A condition', 'A loop', 'A variable', 'A function'], 1],
      ['What is 7 modulo 3 (7 % 3)?', ['1', '2', '3', '0'], 0],
      ['Which operator means logical AND in most languages?', ['||', '&&', '!', '=='], 1],
      ['Which pair are the possible boolean values?', ['true & false', 'yes & no', '1, 2, 3', 'null only'], 0],
    ],
  },
  {
    slug: 'dev-quiz-web-umum',
    kursus: 'General Web Knowledge (Dev)',
    quiz: 'General Web Knowledge Quiz',
    soal: [
      ['Which protocol serves web pages?', ['FTP', 'HTTP/HTTPS', 'SMTP', 'SSH'], 1],
      ['Which language runs in the browser?', ['Python', 'JavaScript', 'Java', 'C#'], 1],
      ['What does DNS do?', ['Stores files', 'Translates domain names into IP addresses', 'Encrypts data', 'Compresses images'], 1],
      ['Which HTTP status code means "Not Found"?', ['200', '301', '404', '500'], 2],
    ],
  },
];

async function main() {
  const roleId = async (kode: string) =>
    (await one<{ id: string }>(`SELECT id FROM roles WHERE kode=$1`, [kode]))!.id;

  const siswaRole = await roleId('siswa');
  const instrukturRole = await roleId('instruktur');
  const pass = await hashPassword(DEV_PASSWORD);

  // 1) Siswa target (buat bila belum ada; jangan timpa nama bila sudah ada) --------
  const existingSiswa = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, [TARGET_EMAIL]);
  const siswaId =
    existingSiswa?.id ??
    (await one<{ id: string }>(
      `INSERT INTO users (nama_lengkap, email, password_hash, role_id, status, email_verified_at)
       VALUES ($1,$2,$3,$4,'active',now()) RETURNING id`,
      [TARGET_NAMA, TARGET_EMAIL, pass, siswaRole],
    ))!.id;
  logger.info(`${existingSiswa ? 'Using' : 'Creating'} student: ${TARGET_EMAIL}`);

  // 2) Instruktur dev + profil (pemilik kursus/kuis) ------------------------------
  const instrukturId =
    (await one<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, ['dev.instruktur@lmshub.test']))?.id ??
    (await one<{ id: string }>(
      `INSERT INTO users (nama_lengkap, email, password_hash, role_id, status, email_verified_at)
       VALUES ('Instruktur Dev','dev.instruktur@lmshub.test',$1,$2,'active',now()) RETURNING id`,
      [pass, instrukturRole],
    ))!.id;
  const instrukturProfilId = (await one<{ id: string }>(
    `INSERT INTO instructor_profiles (user_id, bio) VALUES ($1,'Instructor for the development quiz data.')
     ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio RETURNING id`,
    [instrukturId],
  ))!.id;

  // 3) Kategori dev ---------------------------------------------------------------
  const categoryId = (await one<{ id: string }>(
    `INSERT INTO categories (nama, slug, ikon) VALUES ('Dev / Uji Coba','dev-uji-coba','flask')
     ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET nama = EXCLUDED.nama RETURNING id`,
  ))!.id;

  // 4) Per-spec: kursus + enrollment aktif + kuis + soal --------------------------
  for (const spec of QUIZ_SPECS) {
    // 4a) Kursus dev — sengaja 'draf' agar TIDAK muncul di katalog publik.
    // Siswa tetap bisa mengerjakan kuisnya karena akses lewat enrollment (bukan status terbit).
    const courseId = (await one<{ id: string }>(
      `INSERT INTO courses (judul, slug, ringkasan, category_id, instructor_id, level, harga,
                            status_publikasi, bahasa)
       VALUES ($1,$2,$3,$4,$5,'pemula',0,'draf','id')
       ON CONFLICT (slug) WHERE deleted_at IS NULL
         DO UPDATE SET status_publikasi='draf', judul = EXCLUDED.judul
       RETURNING id`,
      [spec.kursus, spec.slug, `Development course for trying out ${spec.quiz}.`, categoryId, instrukturProfilId],
    ))!.id;

    // 4b) Enrollment AKTIF milik siswa (guard: unique index user+course saat aktif)
    await q(
      `INSERT INTO enrollments (user_id, course_id, sumber, status)
       SELECT $1,$2,'assign','aktif'
       WHERE NOT EXISTS (
         SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL AND status <> 'batal'
       )`,
      [siswaId, courseId],
    );

    // 4c) Kuis (skip bila sudah ada kuis dengan judul sama di kursus ini)
    const kuisAda = await one(
      `SELECT 1 AS ok FROM quizzes WHERE course_id=$1 AND judul=$2 AND deleted_at IS NULL LIMIT 1`,
      [courseId, spec.quiz],
    );
    if (kuisAda) {
      logger.info(`Quiz already exists, skipped: ${spec.quiz}`);
      continue;
    }

    const bankId = (await one<{ id: string }>(
      `INSERT INTO question_banks (nama, course_id, deskripsi, created_by)
       VALUES ($1,$2,'Development question bank (scratch)',$3) RETURNING id`,
      [`Question Bank — ${spec.kursus}`, courseId, instrukturId],
    ))!.id;

    const quizId = (await one<{ id: string }>(
      `INSERT INTO quizzes (course_id, judul, deskripsi, batas_waktu_menit, attempt_maksimal,
                            passing_score, tampilkan_jawaban_setelah_selesai, is_aktif, total_poin)
       VALUES ($1,$2,'Take this to test your understanding (development data).',10,3,70,true,true,$3) RETURNING id`,
      [courseId, spec.quiz, spec.soal.length],
    ))!.id;

    let urut = 1;
    for (const [teks, opsi, benarIdx] of spec.soal) {
      const questionId = (await one<{ id: string }>(
        `INSERT INTO questions (question_bank_id, tipe, teks_soal, poin)
         VALUES ($1,'pilihan_tunggal',$2,1) RETURNING id`,
        [bankId, teks],
      ))!.id;
      for (let o = 0; o < opsi.length; o++) {
        await q(
          `INSERT INTO question_options (question_id, teks_opsi, is_benar, urutan) VALUES ($1,$2,$3,$4)`,
          [questionId, opsi[o], o === benarIdx, o + 1],
        );
      }
      await q(`INSERT INTO quiz_questions (quiz_id, question_id, urutan) VALUES ($1,$2,$3)`, [quizId, questionId, urut++]);
    }
    logger.info(`✅ Quiz created: ${spec.quiz} (${spec.soal.length} questions)`);
  }

  logger.info(
    '\n────────────────────────────────────────\n' +
      '✅ Student quiz seed complete.\n' +
      `   Student login : ${TARGET_EMAIL} / ${DEV_PASSWORD}\n` +
      `   Quizzes ready : ${QUIZ_SPECS.map((s) => s.quiz).join(', ')}\n` +
      '   Where         : Assessments → the "Quizzes & Exams" tab → Take\n' +
      '────────────────────────────────────────',
  );
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Student quiz seed failed');
  process.exit(1);
});
