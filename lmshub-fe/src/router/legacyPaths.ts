/**
 * URLs from releases that used Indonesian slugs, mapped to their English names.
 *
 * Old links live on outside the app — bookmarks, emails already sent, and the
 * QR codes printed on certificates issued before the rename (`/sertifikat/…`).
 * The router sends any path it no longer knows through `translateLegacyPath`
 * and redirects when the result differs, so none of those break.
 *
 * Each entry replaces whole path segments, longest match first, so
 * `kursus/tambah` wins over `kursus`, and `/d/sertifikat` (dashboard) is kept
 * apart from `/sertifikat` (public verification page).
 */
const LEGACY: Array<[string, string]> = [
  // Dashboard
  ['/d/asesmen/kuis/tambah', '/d/assessments/quizzes/new'],
  ['/d/asesmen/kuis', '/d/assessments/quizzes'],
  ['/d/asesmen', '/d/assessments'],
  ['/d/belajar', '/d/learn'],
  ['/d/diskusi/moderasi', '/d/discussions/moderation'],
  ['/d/diskusi', '/d/discussions'],
  ['/d/katalog', '/d/catalog'],
  ['/d/kategori', '/d/categories'],
  ['/d/konten/media', '/d/media'],
  ['/d/konten', '/d/curriculum'],
  ['/d/kursus/tambah', '/d/courses/new'],
  ['/d/kursus', '/d/courses'],
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
  ['/d/sertifikat/badge', '/d/certificates/badges'],
  ['/d/sertifikat/lihat', '/d/certificates/view'],
  ['/d/sertifikat/template', '/d/certificates/templates'],
  ['/d/sertifikat', '/d/certificates'],
  ['/d/transaksi/tanda-jadi', '/d/transactions/manual-payment'],
  ['/d/transaksi', '/d/transactions'],
  // Public
  ['/kursus', '/courses'],
  ['/instruktur', '/instructors'],
  ['/sertifikat', '/certificates'],
  ['/verifikasi-email', '/verify-email'],
];

/** Trailing segments after an id: `/pengguna/:id/ubah`, `/live-class/:id/kehadiran`, `/kuis/:id/kerjakan`. */
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
