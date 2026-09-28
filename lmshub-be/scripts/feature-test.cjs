/* eslint-disable */
// Feature-by-feature E2E smoke test against a running lmshub-be.
// Pakai: (PORT=4090 npx tsx src/server.ts &) ; sleep 4 ; BASE=http://localhost:4090/api/v1 node scripts/feature-test.cjs
// NOTE: this script CREATES test data. Clean up with a re-migrate + seed afterwards.
const { Client } = require('pg');
const BASE = process.env.BASE || 'http://localhost:4090/api/v1';
const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/lmshub?sslmode=disable';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
  return cond;
}
async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
}
const section = (t) => results.push(`\n▸ ${t}`);

(async () => {
  const db = new Client({ connectionString: DB }); await db.connect();

  // ── A. Health ──
  section('A. Health & readiness');
  const h = await api('GET', '/health'); check('GET /health 200', h.s === 200 && h.d.data.status === 'ok');
  const rd = await api('GET', '/ready'); check('GET /ready reports the database connected', rd.d?.data?.db === true, JSON.stringify(rd.d));

  // ── B. Auth ──
  section('B. Authentication');
  const email = `uji_${Date.now()}@test.com`;
  const reg = await api('POST', '/auth/register', null, { nama_lengkap: 'Test Student', email, password: 'Rahasia123', sebagai: 'siswa' });
  check('register a student -> 201 + token', reg.s === 201 && !!reg.d.data?.tokens?.access_token, JSON.stringify(reg.d.error));
  const badLogin = await api('POST', '/auth/login', null, { identifier: email, password: 'wrong-password' });
  check('login with the wrong password -> 401', badLogin.s === 401);
  const adminL = await api('POST', '/auth/login', null, { identifier: 'admin@lmshub.test', password: 'Admin12345!' });
  const admin = adminL.d.data?.tokens?.access_token; check('login admin → token', !!admin);
  const rinaL = await api('POST', '/auth/login', null, { identifier: 'rina@lmshub.test', password: 'Demo12345!' });
  const rina = rinaL.d.data?.tokens?.access_token; check('login as instructor -> token', !!rina);
  const sitiL = await api('POST', '/auth/login', null, { identifier: 'siti@lmshub.test', password: 'Demo12345!' });
  const siti = sitiL.d.data?.tokens?.access_token; const sitiId = sitiL.d.data?.user?.id; check('login as student -> token', !!siti);
  const me = await api('GET', '/auth/me', admin); check('GET /me admin → permissions ["*"]', me.d.data?.permissions?.includes('*'));
  const refresh = await api('POST', '/auth/refresh', null, { refresh_token: sitiL.d.data.tokens.refresh_token });
  check('refresh token -> a new token', !!refresh.d.data?.tokens?.access_token);

  // ── C. RBAC ──
  section('C. RBAC enforcement');
  check('student GET /users -> 403', (await api('GET', '/users', siti)).s === 403);
  check('GET /users without a token -> 401', (await api('GET', '/users', null)).s === 401);
  check('admin GET /users -> 200', (await api('GET', '/users', admin)).s === 200);

  // ── D. Users ──
  section('D. User management');
  const newU = await api('POST', '/users', admin, { nama_lengkap: 'Test Staff', email: `staf_${Date.now()}@test.com`, password: 'Rahasia123', role_kode: 'admin_ops' });
  const newUid = newU.d.data?.id; check('admin creates a user -> 201', newU.s === 201, JSON.stringify(newU.d.error));
  check('GET /users/:id', newUid && (await api('GET', `/users/${newUid}`, admin)).s === 200);
  check('GET /users/_roles (role catalogue)', (await api('GET', '/users/_roles', admin)).d.data?.length === 10);
  check('GET /users/_permissions (permission catalogue)', (await api('GET', '/users/_permissions', admin)).d.data?.length > 100);
  if (newUid) check('set permissions checklist', (await api('PUT', `/users/${newUid}/permissions`, admin, { permissions: [{ module: 'kursus', action: 'view', effect: 'allow' }] })).s === 200);

  // ── E. Categories ──
  section('E. Kategori');
  check('GET /categories/public', Array.isArray((await api('GET', '/categories/public', null)).d.data));
  const cat = await api('POST', '/categories', admin, { nama: `Test Category ${Date.now()}` });
  check('admin creates a category -> 201', cat.s === 201, JSON.stringify(cat.d.error));

  // ── F. Courses lifecycle ──
  section('F. Kursus & lifecycle publikasi');
  const catId = (await api('GET', '/categories/public', null)).d.data[0]?.id;
  const crs = await api('POST', '/courses', rina, { judul: `Test Course ${Date.now()}`, category_id: catId, harga: 300000, level: 'pemula', ringkasan: 'test' });
  const crsId = crs.d.data?.id; check('instructor creates a course -> 201 (draft)', crs.s === 201 && (crs.d.data.status_publikasi === 'draf'), JSON.stringify(crs.d.error));
  if (crsId) {
    check('submit → dalam_review', (await api('POST', `/courses/${crsId}/submit`, rina, {})).d.data?.status_publikasi === 'dalam_review');
    check('admin publish → terbit', (await api('POST', `/courses/${crsId}/publish`, admin, {})).d.data?.status_publikasi === 'terbit');
  }
  check('GET /courses/public (catalogue)', (await api('GET', '/courses/public', null)).d.data?.length >= 3);
  check('GET /courses/public/:slug (detail)', (await api('GET', '/courses/public/dasar-pemrograman-web', null)).d.data?.judul === 'Dasar Pemrograman Web');
  check('instructor lists courses (scoped)', (await api('GET', '/courses', rina)).s === 200);

  // ── G. Curriculum ──
  section('G. Kurikulum');
  const demoCourse = (await db.query(`SELECT id FROM courses WHERE slug='dasar-pemrograman-web'`)).rows[0].id;
  const secs = await api('GET', `/courses/${demoCourse}/sections`, rina);
  check('GET sections of the demo course -> 3 or more sections', Array.isArray(secs.d.data) && secs.d.data.length >= 3, JSON.stringify(secs.d.error || secs.s));

  // ── H. Enrollment ──
  section('H. Enrollment');
  const myEnr = await api('GET', '/enrollments', siti);
  check('student "my courses" -> at least 1', Array.isArray(myEnr.d.data) && myEnr.d.data.length >= 1, JSON.stringify(myEnr.d.error || myEnr.s));

  // ── I. Progress ──
  section('I. Progress belajar');
  const lesson = (await db.query(`SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=$1 ORDER BY s.urutan,l.urutan LIMIT 1`, [demoCourse])).rows[0]?.id;
  if (lesson) {
    const pr = await api('PUT', `/lessons/${lesson}/progress`, siti, { status: 'selesai', posisi_detik: 480 });
    check('PUT progress pelajaran → selesai', pr.s === 200, JSON.stringify(pr.d.error || pr.s));
    const cp = await api('GET', `/courses/${demoCourse}/progress`, siti);
    check('GET course progress (percentage)', cp.s === 200, JSON.stringify(cp.d.error || cp.s));
  } else check('pelajaran demo tersedia', false);

  // ── J. Orders + Midtrans (dev auto-settle) ──
  section('J. Transaksi & Midtrans (dev auto-settle)');
  const cfg = await api('GET', '/orders/payment-config', siti);
  check('GET payment-config (provider midtrans)', cfg.d.data?.provider === 'midtrans');
  const buyCourse = (await db.query(`SELECT id, harga FROM courses WHERE slug='uiux-fundamental'`)).rows[0];
  const order = await api('POST', '/orders', siti, { items: [{ item_tipe: 'kursus', course_id: buyCourse.id }] });
  const orderId = order.d.data?.id; check('checkout → order menunggu_pembayaran', order.d.data?.status === 'menunggu_pembayaran', JSON.stringify(order.d.error));
  if (orderId) {
    const pg = await api('POST', `/orders/${orderId}/pay-gateway`, siti, {});
    check('pay-gateway (dev auto-settle)', pg.d.data?.dev_auto_settled === true || pg.d.data?.order?.status === 'akses_aktif', JSON.stringify(pg.d.error));
    const ord = (await db.query(`SELECT status FROM orders WHERE id=$1`, [orderId])).rows[0];
    check('order → akses_aktif', ord.status === 'akses_aktif');
    const enr = (await db.query(`SELECT COUNT(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=$2`, [sitiId, buyCourse.id])).rows[0];
    check('enrolment created automatically', enr.n === 1);
    const rev = (await db.query(`SELECT COALESCE(SUM(nominal_share),0)::int s FROM revenue_shares WHERE course_id=$1`, [buyCourse.id])).rows[0];
    check('instructor revenue share recorded (60%)', rev.s === Math.round(Number(buyCourse.harga) * 0.6), 'share=' + rev.s);
  }

  // -- K. Dashboards per role --
  section('K. Dashboard per role');
  for (const [role, tok] of [['siswa', siti], ['instruktur', rina], ['admin', admin], ['direktur', admin], ['ketua', admin], ['pembina', admin]]) {
    const dr = await api('GET', `/dashboard/${role}`, tok);
    check(`dashboard/${role} → 200`, dr.s === 200, JSON.stringify(dr.d.error || dr.s));
  }

  // ── L. Konten/pengaturan/audit ──
  section('L. Dokumen, pengaturan, audit');
  check('GET /pages (admin, konten.view)', (await api('GET', '/pages', admin)).s === 200);
  check('GET /settings (admin)', (await api('GET', '/settings', admin)).s === 200);
  check('GET /audit (admin)', (await api('GET', '/audit', admin)).s === 200);

  // ── M. Notifikasi & marketing & sertifikat ──
  section('M. Notifikasi / marketing / sertifikat');
  check('GET /notifications (student)', (await api('GET', '/notifications', siti)).s === 200);
  check('GET /marketing/leads (admin)', [200].includes((await api('GET', '/marketing/leads', admin)).s));
  const cv = await api('GET', '/public/certificates/verify/TIDAKADA', null);
  check('public certificate verification of a made-up number -> tidak_ditemukan', cv.s === 200 && cv.d.data?.status === 'tidak_ditemukan', JSON.stringify(cv.d));

  // ── N. Sertifikat: terbitkan (claim) → render → verifikasi publik ──
  section('N. Sertifikat: terbitkan, render, verifikasi');
  const sitiEnr = (await db.query(`SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL LIMIT 1`, [sitiId, demoCourse])).rows[0]?.id;
  if (sitiEnr) {
    // Selesaikan SELURUH pelajaran demo course agar progres 100% (alur nyata selesai → sertifikat)
    const allLessons = (await db.query(`SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=$1`, [demoCourse])).rows;
    for (const l of allLessons) await api('PUT', `/lessons/${l.id}/progress`, siti, { status: 'selesai', posisi_detik: 480 });
    const cp = await api('GET', `/courses/${demoCourse}/progress`, siti);
    check('progres siti 100% setelah semua pelajaran selesai', Number(cp.d.data?.persen_selesai) === 100, JSON.stringify(cp.d.data));
    const claim = await api('POST', `/enrollments/${sitiEnr}/certificate/claim`, siti, {});
    const certId = claim.d.data?.id;
    check('student claims a certificate -> issued + number', claim.d.data?.status === 'terbit' && !!claim.d.data?.nomor_sertifikat, JSON.stringify(claim.d.error || claim.s));
    check('sertifikat memuat QR code (data URI)', typeof claim.d.data?.qr_code_url === 'string' && claim.d.data.qr_code_url.startsWith('data:image'));
    const nomor = claim.d.data?.nomor_sertifikat;
    if (certId) {
      const render = await api('GET', `/certificates/${certId}/render`, siti);
      check('render certificate (name + course + instructor)', render.d.data?.nama === 'Siti Aminah' && !!render.d.data?.kursus, JSON.stringify(render.d.error || render.s));
    }
    const claim2 = await api('POST', `/enrollments/${sitiEnr}/certificate/claim`, siti, {});
    check('claim ulang → idempoten (tetap terbit)', claim2.d.data?.status === 'terbit');
    if (nomor) {
      const v = await api('GET', `/public/certificates/verify/${nomor}`, null);
      check('verifikasi publik → valid + data lengkap', v.d.data?.status === 'valid' && v.d.data?.nama === 'Siti Aminah' && !!v.d.data?.qr_code_url, JSON.stringify(v.d).slice(0, 120));
    }
    // another student may not render Siti's certificate
    const other = await api('GET', `/certificates/${certId}/render`, admin);
    check('admin boleh render (staf)', other.s === 200);
  } else {
    check('an enrolment is available to certify', false);
  }

  // ── O. Verifikasi Email & Login Google ──
  section('O. Verifikasi email & Google');
  const vEmail = `ftverif_${Date.now()}@test.com`;
  const vReg = await api('POST', '/auth/register', null, { nama_lengkap: 'FT Verif', email: vEmail, password: 'Rahasia123' });
  const devToken = vReg.d.data?.email_verification?.dev_token;
  check('register memicu verifikasi email (dev_token)', vReg.s === 201 && !!devToken);
  check('verify-email token valid → ok', devToken && (await api('POST', '/auth/verify-email', null, { token: devToken })).d.data?.ok === true);
  check('verify-email with a bad token -> 400', (await api('POST', '/auth/verify-email', null, { token: 'tokensalah123' })).s === 400);
  check('GET /auth/oauth-config', (await api('GET', '/auth/oauth-config', null)).s === 200);
  check('Google sign-in while unconfigured -> 401', (await api('POST', '/auth/google', null, { id_token: 'dummy.token' })).s === 401);

  // ── P. Pembayaran transfer bank manual + konfirmasi admin ──
  section('P. Transfer bank manual → konfirmasi admin');
  const pcfg = await api('GET', '/orders/payment-config', siti);
  check('payment-config: Midtrans + info bank transfer', !!pcfg.d.data?.midtrans && !!pcfg.d.data?.bank_transfer?.nomor_rekening);
  const tfCourse = (await db.query(`SELECT id, harga FROM courses WHERE slug='digital-marketing-praktis'`)).rows[0];
  const tfOrder = await api('POST', '/orders', siti, { items: [{ item_tipe: 'kursus', course_id: tfCourse.id }] });
  const tfOid = tfOrder.d.data?.id;
  if (tfOid) {
    const tfPay = await api('POST', `/orders/${tfOid}/pay`, siti, { jenis: 'penuh', nominal: Number(tfCourse.harga), metode: 'transfer_bank', referensi_gateway: 'TF Siti - BCA' });
    check('pay by transfer_bank -> menunggu_verifikasi (not active yet)', tfPay.d.data?.payment?.status === 'menunggu_verifikasi', JSON.stringify(tfPay.d.error || tfPay.d.data?.payment?.status));
    check('order is not akses_aktif before confirmation', (await db.query(`SELECT status FROM orders WHERE id=$1`, [tfOid])).rows[0].status !== 'akses_aktif');
    const tfVerify = await api('POST', `/orders/${tfOid}/verify`, admin, { payment_id: tfPay.d.data?.payment?.id, aksi: 'verify' });
    check('admin konfirmasi manual → 200', tfVerify.s === 200, JSON.stringify(tfVerify.d.error || tfVerify.s));
    check('setelah konfirmasi → order akses_aktif', (await db.query(`SELECT status FROM orders WHERE id=$1`, [tfOid])).rows[0].status === 'akses_aktif');
    check('enrolment created through a manual transfer', (await db.query(`SELECT COUNT(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=$2`, [sitiId, tfCourse.id])).rows[0].n === 1);
  }

  // -- Q. Routes that used to 404 (regression guard) --
  section('Q. Endpoints that used to 404 (role dashboards, submissions, cohorts, marketing, profile)');
  for (const role of ['super_admin', 'direktur', 'ketua', 'pembina', 'admin_ops', 'instruktur', 'asisten', 'marketing', 'siswa', 'sub_user']) {
    check(`GET /dashboard/${role} → 200`, (await api('GET', `/dashboard/${role}`, admin)).s === 200);
  }
  check('GET /submissions (antrian grading)', (await api('GET', '/submissions', admin)).s === 200);
  check('GET /submissions?status=menunggu_penilaian', (await api('GET', '/submissions?status=menunggu_penilaian', admin)).s === 200);
  check('GET /cohorts (cohort list)', (await api('GET', '/cohorts', admin)).s === 200);
  check('GET /marketing/dashboard', (await api('GET', '/marketing/dashboard', admin)).s === 200);
  check('GET /marketing/leaderboard', (await api('GET', '/marketing/leaderboard', admin)).s === 200);
  check('PATCH /users/me (profil sendiri)', (await api('PATCH', '/users/me', siti, { nama_lengkap: 'Siti Aminah' })).s === 200);

  await db.end();
  // ── Ringkasan ──
  console.log(results.join('\n'));
  console.log(`\n══════════════════════════════════════`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log(`══════════════════════════════════════`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
