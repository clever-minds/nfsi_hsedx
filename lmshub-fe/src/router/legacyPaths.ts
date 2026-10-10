/**
 * URLs from releases that used Indonesian slugs, mapped to their English names.
 *
 * Old links live on outside the app — bookmarks, emails already sent, and the
 * QR codes printed on certificates issued before the rename (`/certificate/…`).
 * The router sends any path it no longer knows through `translateLegacyPath`
 * and redirects when the result differs, so none of those break.
 *
 * Each entry replaces whole path segmentts, longest match first, so
 * `course/add` wins over `course`, and `/d/certificate` (dashboard) is kept
 * apart from `/certificate` (public verification page).
 */
const LEGACY: Array<[string, string]> = [
  // Dashboard
  ['/d/assessment/quiz/add', '/d/assessments/quizzes/new'],
  ['/d/assessment/quiz', '/d/assessments/quizzes'],
  ['/d/assessment', '/d/assessments'],
  ['/d/belajar', '/d/learn'],
  ['/d/discussion/moderasi', '/d/discussions/moderation'],
  ['/d/discussion', '/d/discussions'],
  ['/d/catalog', '/d/catalog'],
  ['/d/category', '/d/categories'],
  ['/d/content/media', '/d/media'],
  ['/d/content', '/d/curriculum'],
  ['/d/course/add', '/d/courses/new'],
  ['/d/course', '/d/courses'],
  ['/d/report/payout', '/d/reports/payouts'],
  ['/d/report', '/d/reports'],
  ['/d/live-class/calendar', '/d/live-class/calendar'],
  ['/d/marketing/kupon', '/d/marketing/coupons'],
  ['/d/notification/preferensi', '/d/notifications/preferences'],
  ['/d/notification', '/d/notifications'],
  ['/d/settings/mata-uang', '/d/settings/currencies'],
  ['/d/settings/account', '/d/settings/bank-accounts'],
  ['/d/settings', '/d/settings'],
  ['/d/user/add', '/d/users/new'],
  ['/d/user', '/d/users'],
  ['/d/profile', '/d/profile'],
  ['/d/certificate/badge', '/d/certificates/badges'],
  ['/d/certificate/view', '/d/certificates/view'],
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

/** Trailing segmentts after an id: `/user/:id/edit`, `/live-class/:id/kehadiran`, `/quiz/:id/kerjakan`. */
const LEGACY_SUFFIX: Array<[RegExp, string]> = [
  [/^(\/d\/users\/[^/]+)\/edit$/, '$1/edit'],
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
