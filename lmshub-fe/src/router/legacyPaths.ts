/**
 * URLs from releases that used Indonesian slugs, mapped to their English names.
 *
 * Old links live on outside the app — bookmarks, emails already sent, and the
 * QR codes printed on certificates issued before the rename (`/certificate/…`).
 * The router sends any path it no longer knows through `translateLegacyPath`
 * and redirects when the result differs, so none of those break.
 *
 * Each entry replaces whole path segments, longest match first, so
 * `course/tambah` wins over `course`, and `/d/certificate` (dashboard) is kept
 * apart from `/certificate` (public verification page).
 */
const LEGACY: Array<[string, string]> = [
  // Dashboard
  ['/d/assessment/quiz/tambah', '/d/assessments/quizzes/new'],
  ['/d/assessment/quiz', '/d/assessments/quizzes'],
  ['/d/assessment', '/d/assessments'],
  ['/d/belajar', '/d/learn'],
  ['/d/diskusi/moderasi', '/d/discussions/moderation'],
  ['/d/diskusi', '/d/discussions'],
  ['/d/catalog', '/d/catalog'],
  ['/d/kategori', '/d/categories'],
  ['/d/content/media', '/d/media'],
  ['/d/content', '/d/curriculum'],
  ['/d/course/tambah', '/d/courses/new'],
  ['/d/course', '/d/courses'],
  ['/d/laporan/payout', '/d/reports/payouts'],
  ['/d/laporan', '/d/reports'],
  ['/d/live-class/kalender', '/d/live-class/calendar'],
  ['/d/marketing/kupon', '/d/marketing/coupons'],
  ['/d/notifikasi/preferensi', '/d/notifications/preferences'],
  ['/d/notifikasi', '/d/notifications'],
  ['/d/pengaturan/mata-uang', '/d/settings/currencies'],
  ['/d/pengaturan/rekening', '/d/settings/bank-accounts'],
  ['/d/pengaturan', '/d/settings'],
  ['/d/pengguna/tambah', '/d/users/new'],
  ['/d/pengguna', '/d/users'],
  ['/d/profil', '/d/profile'],
  ['/d/certificate/badge', '/d/certificates/badges'],
  ['/d/certificate/lihat', '/d/certificates/view'],
  ['/d/certificate/template', '/d/certificates/templates'],
  ['/d/certificate', '/d/certificates'],
  ['/d/transaction/tanda-jadi', '/d/transactions/manual-payment'],
  ['/d/transaction', '/d/transactions'],
  // Public
  ['/course', '/courses'],
  ['/instructor', '/instructors'],
  ['/certificate', '/certificates'],
  ['/verifikasi-email', '/verify-email'],
];

/** Trailing segments after an id: `/pengguna/:id/ubah`, `/live-class/:id/kehadiran`, `/quiz/:id/kerjakan`. */
const LEGACY_SUFFIX: Array<[RegExp, string]> = [
  [/^(\/d\/users\/[^/]+)\/ubah$/, '$1/edit'],
  [/^(\/d\/live-class\/[^/]+)\/kehadiran$/, '$1/attendance'],
  [/^(\/d\/assessments\/quizzes\/[^/]+)\/kerjakan$/, '$1/take'],
];

/** The English path for a legacy one, or the input unchanged when it is not legacy. */
export function translateLegacyPath(path: string): string {
  let out = path;
  for (const [from, to] of LEGACY) {
    if (out === from || out.startsWith(`${from}/`)) {
      out = to + out.slice(from.length);
      break;
    }
  }
  for (const [re, to] of LEGACY_SUFFIX) out = out.replace(re, to);
  return out;
}
