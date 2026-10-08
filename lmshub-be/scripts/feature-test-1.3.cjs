/* eslint-disable */
// E2E untuk fitur 1.3.0: halaman statis (CMS), unggah gambar hero, ganti email
// super admin, dan aturan kelulusan (ujian akhir, passing score, batas & jeda
// percobaan, gating sertifikat, ulang kursus).
//
// Pakai terhadap server yang berjalan dengan data `seed` + `seed:demo`:
//   BASE=http://localhost:4090/api/v1 DATABASE_URL=... node scripts/feature-test-1.3.cjs
// NOTE: skrip ini MEMBUAT data uji (dan mengganti email super admin, lalu
// mengembalikannya). Bersihkan dengan migrate ulang + seed sesudahnya.
const { Client } = require('pg');
const BASE = process.env.BASE || 'http://localhost:4090/api/v1';
const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/lmshub?sslmode=disable';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@lmshub.test';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin12345!';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
  return cond;
}
async function api(method, path, token, body, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
const err = (r) => JSON.stringify(r.d?.error ?? r.s);
const section = (t) => results.push(`\n▸ ${t}`);
const login = async (identifier, password) => (await api('POST', '/auth/login', null, { identifier, password })).d?.data?.tokens?.access_token;

// 1×1 PNG yang sah.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  const db = new Client({ connectionString: DB }); await db.connect();
  const admin = await login(ADMIN_EMAIL, ADMIN_PASS);
  const siti = await login('siti@lmshub.test', 'Demo12345!');
  const rina = await login('rina@lmshub.test', 'Demo12345!');
  check('login admin, instructor, student', admin && siti && rina);
  const sitiId = (await api('GET', '/auth/me', siti)).d?.data?.id;

  // ── A. Halaman statis ────────────────────────────────────────────────
  section('A. Pages (CMS) + footer');
  const pub = await api('GET', '/public/pages', null);
  const slugs = (pub.d?.data ?? []).map((p) => p.slug);
  check('GET /public/pages tanpa login → 200', pub.s === 200, err(pub));
  for (const s of ['about-us', 'help-center', 'privacy-policy', 'terms-and-conditions', 'contact']) {
    check(`halaman bawaan "${s}" terbit & tampil di footer`, (pub.d?.data ?? []).some((p) => p.slug === s && p.tampil_di_footer));
    const page = await api('GET', `/pages/${s}`, null);
    check(`GET /pages/${s} → 200 (link footer tidak 404)`, page.s === 200 && typeof page.d?.data?.konten?.html === 'string', err(page));
  }
  check('daftar publik tidak membawa isi halaman', pub.d?.data?.[0] && !('konten' in pub.d.data[0]));

  const slug = `test-page-${Date.now()}`;
  const create = await api('POST', '/pages', admin, {
    slug, judul: 'Test Page', status: 'draft', tampil_di_footer: true, urutan_footer: 9,
    konten_html: '<h2>Hello</h2><p onclick="x()">safe</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
  });
  const pageId = create.d?.data?.id;
  check('admin membuat halaman → 201', create.s === 201, err(create));
  const html = create.d?.data?.konten?.html ?? '';
  check('isi disanitasi di server (tanpa script/onclick/javascript:)', html.includes('<h2>Hello</h2>') && !/script|onclick|javascript:/i.test(html), html);
  check('halaman draft tidak bisa dibuka publik → 404', (await api('GET', `/pages/${slug}`, null)).s === 404);
  check('slug duplikat → 409', (await api('POST', '/pages', admin, { slug, judul: 'Dup' })).s === 409);
  check('slug tidak valid → 422', (await api('POST', '/pages', admin, { slug: 'Bad Slug!', judul: 'x' })).s === 422);
  check('siswa tidak bisa membuat halaman → 403', (await api('POST', '/pages', siti, { slug: slug + 'x', judul: 'x' })).s === 403);
  check('instruktur (punya izin konten) tidak bisa membuat halaman situs → 403', (await api('POST', '/pages', rina, { slug: slug + 'y', judul: 'x' })).s === 403);
  check('instruktur tidak bisa melihat daftar halaman admin → 403', (await api('GET', '/pages', rina)).s === 403);

  const upd = await api('PUT', `/pages/${pageId}`, admin, { status: 'terbit', judul: 'Test Page 2', konten_html: '<p>v2</p>' });
  check('publish + ubah isi → 200', upd.s === 200 && upd.d?.data?.status === 'terbit', err(upd));
  const pubPage = await api('GET', `/pages/${slug}`, null);
  check('halaman terbit terbaca publik dengan isi baru', pubPage.s === 200 && pubPage.d?.data?.konten?.html === '<p>v2</p>', err(pubPage));
  check('halaman baru masuk daftar footer', ((await api('GET', '/public/pages', null)).d?.data ?? []).some((p) => p.slug === slug));
  const newSlug = slug + '-renamed';
  check('ganti slug → 200', (await api('PUT', `/pages/${pageId}`, admin, { slug: newSlug })).d?.data?.slug === newSlug);
  check('ganti slug ke milik halaman lain → 409', (await api('PUT', `/pages/${pageId}`, admin, { slug: 'about-us' })).s === 409);
  const unpub = await api('PUT', `/pages/${pageId}`, admin, { status: 'draft' });
  check('unpublish → publik 404', unpub.s === 200 && (await api('GET', `/pages/${newSlug}`, null)).s === 404);
  check('siswa tidak bisa menghapus → 403', (await api('DELETE', `/pages/${pageId}`, siti)).s === 403);
  check('admin menghapus → 204', (await api('DELETE', `/pages/${pageId}`, admin)).s === 204);
  check('halaman terhapus hilang dari daftar admin', !((await api('GET', '/pages?limit=100', admin)).d?.data ?? []).some((p) => p.id === pageId));
  check('hapus lagi → 404', (await api('DELETE', `/pages/${pageId}`, admin)).s === 404);

  // ── B. Gambar hero ───────────────────────────────────────────────────
  section('B. Hero image upload');
  const up = await api('POST', '/site-content/asset/hero/upload', admin, PNG, { 'Content-Type': 'image/png' });
  const heroUrl = up.d?.data?.url;
  check('unggah PNG mentah → 200 + url', up.s === 200 && /^\/uploads\/site\/hero-\d+\.png$/.test(heroUrl || ''), err(up));
  check('url tersimpan di blok hero', (await api('GET', '/site-content', null)).d?.data?.hero?.gambar_url === heroUrl);
  const served = await fetch(BASE.replace(/\/api\/v1$/, '') + heroUrl);
  check('berkas tersaji di /uploads', served.status === 200);
  const fake = await api('POST', '/site-content/asset/hero/upload', admin, Buffer.from('<html><script>alert(1)</script></html>'), { 'Content-Type': 'image/png' });
  check('HTML yang mengaku PNG → 400 upload.image_type_invalid', fake.s === 400 && fake.d?.error?.key === 'upload.image_type_invalid', err(fake));
  const gif = await api('POST', '/site-content/asset/hero/upload', admin, Buffer.from('GIF89a'), { 'Content-Type': 'image/gif' });
  check('tipe di luar jpg/png/webp → 400', gif.s === 400, err(gif));
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)]);
  const tooBig = await api('POST', '/site-content/asset/hero/upload', admin, big, { 'Content-Type': 'image/png' });
  check('lebih dari 5MB → 400 upload.max_5mb', tooBig.s === 400 && tooBig.d?.error?.key === 'upload.max_5mb', err(tooBig));
  const almost = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
  const okBig = await api('POST', '/site-content/asset/hero/upload', admin, almost, { 'Content-Type': 'image/png' });
  check('gambar ±4MB diterima (jalur lama base64 menolaknya)', okBig.s === 200, err(okBig));
  const oldGone = await fetch(BASE.replace(/\/api\/v1$/, '') + heroUrl);
  check('berkas hero lama dibuang setelah diganti', oldGone.status === 404);
  check('siswa tidak bisa mengunggah → 403', (await api('POST', '/site-content/asset/hero/upload', siti, PNG, { 'Content-Type': 'image/png' })).s === 403);
  const legacy = await api('POST', '/site-content/asset', admin, { jenis: 'hero', data_base64: PNG.toString('base64'), mime_type: 'image/png' });
  check('jalur lama (JSON base64) tetap jalan', legacy.s === 200, err(legacy));
  const legacyFake = await api('POST', '/site-content/asset', admin, { jenis: 'hero', data_base64: Buffer.from('<svg/>').toString('base64'), mime_type: 'image/png' });
  check('jalur lama kini juga memeriksa isi berkas → 400', legacyFake.s === 400, err(legacyFake));
  check('hapus gambar hero → 200', (await api('DELETE', '/site-content/asset/hero', admin)).s === 200);

  // ── C. Email super admin ─────────────────────────────────────────────
  section('C. Super admin changes own email');
  const newEmail = `owner.${Date.now()}@example.com`;
  check('tanpa password → 422', (await api('PATCH', '/users/me/email', admin, { email: newEmail })).s === 422);
  const wrong = await api('PATCH', '/users/me/email', admin, { email: newEmail, password_saat_ini: 'wrong-password' });
  check('password salah → 400 (bukan 401, agar sesi tidak terputus)', wrong.s === 400 && wrong.d?.error?.key === 'auth.current_password_wrong', err(wrong));
  const taken = await api('PATCH', '/users/me/email', admin, { email: 'SITI@lmshub.test', password_saat_ini: ADMIN_PASS });
  check('email milik akun lain (beda huruf besar) → 409', taken.s === 409 && taken.d?.error?.key === 'user.email_taken', err(taken));
  check('email tidak valid → 422', (await api('PATCH', '/users/me/email', admin, { email: 'nope', password_saat_ini: ADMIN_PASS })).s === 422);
  const notSuper = await api('PATCH', '/users/me/email', siti, { email: `x${Date.now()}@example.com`, password_saat_ini: 'Demo12345!' });
  check('bukan super admin → 403 (aturan lama tetap)', notSuper.s === 403 && notSuper.d?.error?.key === 'user.email_change_requires_super_admin', err(notSuper));
  const changed = await api('PATCH', '/users/me/email', admin, { email: newEmail.toUpperCase(), password_saat_ini: ADMIN_PASS });
  check('super admin mengganti email → 200, disimpan huruf kecil', changed.s === 200 && changed.d?.data?.email === newEmail, err(changed));
  check('login dengan email baru berhasil', !!(await login(newEmail, ADMIN_PASS)));
  check('login dengan email lama gagal', !(await login(ADMIN_EMAIL, ADMIN_PASS)));
  const audit = await db.query(`SELECT 1 FROM audit_log WHERE action = 'change_email' ORDER BY created_at DESC LIMIT 1`);
  check('perubahan tercatat di audit log', audit.rowCount === 1);
  const back = await api('PATCH', '/users/me/email', admin, { email: ADMIN_EMAIL, password_saat_ini: ADMIN_PASS });
  check('kembalikan email semula → 200', back.s === 200, err(back));

  // ── D. Aturan kelulusan ──────────────────────────────────────────────
  section('D. Final exam, passing score, attempts, certificate gating, restart');
  // Dua kursus demo terbit yang punya pelajaran dan belum diikuti siti.
  const courses = (await db.query(`
    SELECT c.id FROM courses c
     WHERE c.deleted_at IS NULL AND c.status_publikasi = 'terbit'
       AND EXISTS (SELECT 1 FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND l.wajib_selesai)
       AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.user_id = $1 AND e.deleted_at IS NULL)
     ORDER BY c.created_at LIMIT 2`, [sitiId])).rows.map((r) => r.id);
  if (!check('ada 2 kursus demo untuk diuji', courses.length === 2)) throw new Error('demo data missing');
  const [examCourse, plainCourse] = courses;

  const enroll = async (courseId) => (await api('POST', '/enrollments', admin, { user_id: sitiId, course_id: courseId, sumber: 'assign' })).d?.data?.id;
  const finishLessons = async (courseId) => {
    const learn = await api('GET', `/courses/${courseId}/learn`, siti);
    for (const s of learn.d?.data?.sections ?? []) for (const l of s.lessons) await api('PUT', `/lessons/${l.id}/progress`, siti, { status: 'selesai' });
    return (await api('GET', `/courses/${courseId}/learn`, siti)).d?.data;
  };

  // Kompatibel mundur: kursus tanpa ujian → sertifikat cukup dengan progres.
  const plainEnr = await enroll(plainCourse);
  check('enroll kursus tanpa ujian', !!plainEnr);
  await finishLessons(plainCourse);
  const plainClaim = await api('POST', `/enrollments/${plainEnr}/certificate/claim`, siti, {});
  check('kursus tanpa ujian akhir: sertifikat terbit seperti sebelumnya', plainClaim.s === 201 && plainClaim.d?.data?.status === 'terbit', err(plainClaim));

  // Soal & kuis.
  const bank = (await api('POST', '/question-banks', admin, { nama: 'Final bank', course_id: examCourse })).d?.data;
  const mkQ = async (n) => (await api('POST', `/question-banks/${bank.id}/questions`, admin, {
    tipe: 'pilihan_tunggal', teks_soal: `Q${n}`, poin: 1,
    options: [{ teks_opsi: 'right', is_benar: true, urutan: 0 }, { teks_opsi: 'wrong', is_benar: false, urutan: 1 }],
  })).d?.data;
  const qs = [await mkQ(1), await mkQ(2), await mkQ(3), await mkQ(4)];
  check('4 soal dibuat', qs.every((q) => q?.id));
  const mkQuiz = async (body) => {
    const q = (await api('POST', '/quizzes', admin, { course_id: examCourse, ...body })).d?.data;
    await api('PUT', `/quizzes/${q.id}/questions`, admin, { questions: qs.map((x, i) => ({ question_id: x.id, urutan: i })) });
    return q;
  };
  const exam = await mkQuiz({ judul: 'Final exam', attempt_maksimal: 2, passing_score: 75, jeda_ulang_menit: 0 });
  check('kuis ujian dibuat dengan passing 75% & 2 percobaan', exam?.attempt_maksimal === 2 && Number(exam?.passing_score) === 75);
  const unlimited = await mkQuiz({ judul: 'Practice (unlimited)', attempt_maksimal: 0 });
  check('attempt_maksimal 0 (tanpa batas) diterima', unlimited?.attempt_maksimal === 0, JSON.stringify(unlimited));
  const cooled = await mkQuiz({ judul: 'With cooldown', attempt_maksimal: 3, jeda_ulang_menit: 60 });
  check('jeda_ulang_menit tersimpan', cooled?.jeda_ulang_menit === 60);
  check('attempt_maksimal negatif → 422', (await api('POST', '/quizzes', admin, { course_id: examCourse, judul: 'bad', attempt_maksimal: -1 })).s === 422);

  // Tetapkan ujian akhir.
  const foreignQuiz = (await db.query(`SELECT id FROM quizzes WHERE course_id <> $1 AND deleted_at IS NULL LIMIT 1`, [examCourse])).rows[0]?.id;
  if (foreignQuiz) {
    check('kuis kursus lain tidak bisa jadi ujian akhir → 400',
      (await api('PUT', `/courses/${examCourse}/completion-rules`, admin, { ujian_akhir_quiz_id: foreignQuiz })).s === 400);
  }
  const statusBefore = (await api('GET', `/courses/${examCourse}`, admin)).d?.data?.status_publikasi;
  const rules = await api('PUT', `/courses/${examCourse}/completion-rules`, admin, { ujian_akhir_quiz_id: exam.id });
  check('tetapkan ujian akhir → 200', rules.s === 200 && rules.d?.data?.ujian_akhir_quiz_id === exam.id, err(rules));
  check('mengatur aturan kelulusan tidak memicu review ulang', rules.d?.data?.status_publikasi === statusBefore);
  check('siswa tidak bisa mengubah aturan kelulusan → 403',
    (await api('PUT', `/courses/${examCourse}/completion-rules`, siti, { izinkan_restart: true })).s === 403);

  const examEnr = await enroll(examCourse);
  const learnData = await finishLessons(examCourse);
  check('progres 100% & enrollment selesai', learnData?.progress_percent === 100 && learnData?.enrollment_status === 'selesai', JSON.stringify({ p: learnData?.progress_percent, s: learnData?.enrollment_status }));
  check('learn view menyebut ujian akhir', learnData?.ujian_akhir?.quiz_id === exam.id);

  const early = await api('POST', `/enrollments/${examEnr}/certificate/claim`, siti, {});
  check('progres 100% tapi belum ujian → sertifikat terkunci (409 final_exam_not_passed)', early.s === 409 && early.d?.error?.key === 'certificate.final_exam_not_passed', err(early));

  const takeExam = async (quizId, correct) => {
    const st = await api('POST', `/quizzes/${quizId}/attempts`, siti, {});
    if (st.s !== 201 && st.s !== 200) return st;
    for (const [i, q] of st.d.data.soal.entries()) {
      const opt = q.opsi.find((o) => (i < correct ? o.teks_opsi === 'right' : o.teks_opsi === 'wrong'));
      await api('PUT', `/attempts/${st.d.data.attempt.id}/answers`, siti, { question_id: q.question_id, jawaban: { option_id: opt.id } });
    }
    return api('POST', `/attempts/${st.d.data.attempt.id}/submit`, siti, {});
  };

  // Percobaan 1: 2/4 = 50% < 75%.
  const a1 = await takeExam(exam.id, 2);
  check('ujian bisa dikerjakan setelah enrollment selesai', a1.s === 200 && a1.d?.data?.attempt?.status === 'dinilai', err(a1));
  check('skor = jawaban benar / total (2 dari 4 poin)', Number(a1.d?.data?.attempt?.skor) === 2);
  const failClaim = await api('POST', `/enrollments/${examEnr}/certificate/claim`, siti, {});
  check('skor 50% < 75% → sertifikat tetap terkunci', failClaim.s === 409 && failClaim.d?.error?.key === 'certificate.final_exam_not_passed', err(failClaim));
  check('pesan menyebut skor terbaik & nilai lulus', /50%.*75%/.test(failClaim.d?.error?.message ?? ''), failClaim.d?.error?.message);

  const list1 = (await api('GET', `/quizzes?filter[course_id]=${examCourse}`, siti)).d?.data ?? [];
  const examRow = list1.find((q) => q.id === exam.id);
  check('daftar kuis siswa: ujian akhir ditandai, sisa 1 percobaan, nilai lulus 75', examRow?.is_ujian_akhir === true && examRow?.sisa_percobaan === 1 && examRow?.nilai_lulus === 75 && examRow?.boleh_mulai === true, JSON.stringify(examRow));

  // Percobaan 2: 3/4 = 75% → lulus.
  const a2 = await takeExam(exam.id, 3);
  check('percobaan ke-2 dinilai 3 poin', Number(a2.d?.data?.attempt?.skor) === 3, err(a2));
  const okClaim = await api('POST', `/enrollments/${examEnr}/certificate/claim`, siti, {});
  check('skor 75% ≥ 75% → sertifikat terbit', okClaim.s === 201 && okClaim.d?.data?.status === 'terbit', err(okClaim));
  check('snapshot sertifikat mencatat hasil ujian', okClaim.d?.data?.syarat_snapshot?.ujian_akhir?.lulus === true);

  const a3 = await api('POST', `/quizzes/${exam.id}/attempts`, siti, {});
  check('percobaan ke-3 → 409 attempt_limit_reached', a3.s === 409 && a3.d?.error?.key === 'quiz.attempt_limit_reached', err(a3));

  // Tanpa batas.
  let unlimitedOk = true;
  for (let i = 0; i < 3; i++) unlimitedOk = unlimitedOk && (await takeExam(unlimited.id, 4)).s === 200;
  check('kuis tanpa batas: 3 percobaan berturut-turut diterima', unlimitedOk);
  const unlRow = ((await api('GET', `/quizzes?filter[course_id]=${examCourse}`, siti)).d?.data ?? []).find((q) => q.id === unlimited.id);
  check('kuis tanpa batas: sisa_percobaan null', unlRow && unlRow.sisa_percobaan === null && unlRow.boleh_mulai === true, JSON.stringify(unlRow));

  // Jeda ulang.
  check('kuis berjeda: percobaan pertama diterima', (await takeExam(cooled.id, 1)).s === 200);
  const cd = await api('POST', `/quizzes/${cooled.id}/attempts`, siti, {});
  check('kuis berjeda: langsung mengulang → 409 retake_cooldown + boleh_lagi_at', cd.s === 409 && cd.d?.error?.key === 'quiz.retake_cooldown' && !!cd.d?.error?.details?.boleh_lagi_at, err(cd));
  const coolRow = ((await api('GET', `/quizzes?filter[course_id]=${examCourse}`, siti)).d?.data ?? []).find((q) => q.id === cooled.id);
  check('daftar kuis siswa melaporkan jeda', coolRow?.boleh_mulai === false && !!coolRow?.boleh_lagi_at);

  check('sertifikat yang sudah terbit tidak dicabut oleh aturan baru',
    (await db.query(`SELECT status FROM certificates WHERE enrollment_id = $1`, [plainEnr])).rows[0]?.status === 'terbit');

  // Ulang kursus.
  const r0 = await api('POST', `/enrollments/${examEnr}/restart`, siti, {});
  check('restart saat kursus tidak mengizinkan → 403', r0.s === 403 && r0.d?.error?.key === 'enrollment.restart_not_allowed', err(r0));
  await api('PUT', `/courses/${examCourse}/completion-rules`, admin, { izinkan_restart: true });
  check('learn view: izinkan_restart = true', (await api('GET', `/courses/${examCourse}/learn`, siti)).d?.data?.izinkan_restart === true);
  const r1 = await api('POST', `/enrollments/${examEnr}/restart`, siti, {});
  check('restart diizinkan → 200, enrollment aktif lagi', r1.s === 200 && r1.d?.data?.status === 'aktif', err(r1));
  const afterRestart = (await api('GET', `/courses/${examCourse}/learn`, siti)).d?.data;
  check('progres kembali 0%', afterRestart?.progress_percent === 0 && afterRestart.sections.every((s) => s.lessons.every((l) => !l.selesai)));
  check('sertifikat terbit tetap ada setelah restart',
    (await db.query(`SELECT status FROM certificates WHERE enrollment_id = $1 AND status = 'terbit'`, [examEnr])).rowCount === 1);
  const a4 = await api('POST', `/quizzes/${exam.id}/attempts`, siti, {});
  check('restart tidak mengembalikan jatah percobaan ujian', a4.s === 409 && a4.d?.error?.key === 'quiz.attempt_limit_reached', err(a4));
  const otherEnr = (await db.query(`SELECT id FROM enrollments WHERE user_id <> $1 AND deleted_at IS NULL LIMIT 1`, [sitiId])).rows[0]?.id;
  if (otherEnr) check('siswa tidak bisa me-restart enrollment orang lain → 403', (await api('POST', `/enrollments/${otherEnr}/restart`, siti, {})).s === 403);
  check('admin bisa me-restart progres siswa', (await api('POST', `/enrollments/${plainEnr}/restart`, admin, {})).s === 200);

  await db.end();
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
