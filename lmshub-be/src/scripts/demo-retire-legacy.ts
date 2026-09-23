import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

/**
 * Retire the previous, Indonesian-language demo catalogue.
 *
 * The demo data was rewritten in English and its slugs changed, so seeding on
 * top of an older installation would leave two parallel catalogues — forty
 * courses in two languages — rather than replacing one with the other.
 *
 * Everything here is a SOFT delete of rows this seeder created itself, matched
 * on exact identifiers. Nothing a buyer authored can match these lists, and any
 * row retired by mistake can be restored by clearing `deleted_at`.
 */

/** Old course slugs with no counterpart in the new catalogue. */
const LEGACY_COURSE_SLUGS = [
  'dasar-pemrograman-web',
  'javascript-modern',
  'python-untuk-pemula',
  'reactjs-dari-nol',
  'vue-3-vite-praktis',
  'backend-nodejs-express',
  'git-github-untuk-tim',
  'uiux-fundamental',
  'figma-dari-dasar',
  'desain-grafis-canva',
  'digital-marketing-praktis',
  'seo-untuk-bisnis',
  'copywriting-menjual',
  'excel-analisis-data',
  'machine-learning-dasar',
  'public-speaking',
  'manajemen-waktu',
];

/**
 * Old category slugs. `data-ai` and `it-software` are deliberately absent — the
 * new catalogue reuses them, so they are updated in place rather than retired.
 */
const LEGACY_CATEGORY_SLUGS = ['pemrograman', 'desain', 'bisnis-marketing', 'pengembangan-diri'];

/** Old demo accounts. The lead student's address is reused and must survive. */
const LEGACY_EMAILS = [
  'budi@lmshub.test',
  // Placeholder account from an older dev script. It carries the literal name
  // "Instruktur Dev", which would appear on the public instructor list.
  'dev.instruktur@lmshub.test',
  'budi.siswa@lmshub.test',
  'citra@lmshub.test',
  'dewi@lmshub.test',
  'eko@lmshub.test',
  'fitri@lmshub.test',
  'gilang@lmshub.test',
];

/**
 * Retirement is OPT-IN.
 *
 * This function soft-deletes accounts and courses. On a live demo server those
 * may be exactly the logins already handed to a reviewer, so it must never run
 * as a side effect of refreshing the demo. Pass `--retire-legacy` (or set
 * `DEMO_RETIRE_LEGACY=1`) to ask for it deliberately.
 */
export function retirementRequested(): boolean {
  return process.argv.includes('--retire-legacy') || process.env.DEMO_RETIRE_LEGACY === '1';
}

/** What retirement would remove, for printing before anything is touched. */
export function retirementPlan(): { courses: number; categories: number; accounts: string[] } {
  return {
    courses: LEGACY_COURSE_SLUGS.length,
    categories: LEGACY_CATEGORY_SLUGS.length,
    accounts: [...LEGACY_EMAILS],
  };
}

export async function retireLegacyDemoData(): Promise<void> {
  // Courses belonging to a retired account go too. The dev-only quiz script
  // creates its own placeholder instructor and three draft courses under it;
  // retiring the account alone left those courses in the catalogue.
  await pool.query(
    `UPDATE courses c SET deleted_at = now()
       FROM instructor_profiles ip, users u
      WHERE ip.id = c.instructor_id AND u.id = ip.user_id
        AND u.email = ANY($1) AND c.deleted_at IS NULL`,
    [LEGACY_EMAILS],
  );

  await pool.query(
    `UPDATE courses SET deleted_at = now() WHERE slug = ANY($1) AND deleted_at IS NULL`,
    [LEGACY_COURSE_SLUGS],
  );

  // Matched on slug rather than on what this run happened to change. Cascading
  // only over freshly-retired rows meant a second run found nothing to do and
  // silently skipped every child row — which is how a certificate for a retired
  // course stayed visible in a student's list.
  const courses = await pool.query<{ id: string }>(
    `SELECT c.id FROM courses c
       LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       LEFT JOIN users u ON u.id = ip.user_id
      WHERE c.slug = ANY($1) OR u.email = ANY($2)`,
    [LEGACY_COURSE_SLUGS, LEGACY_EMAILS],
  );

  if (courses.rowCount) {
    const ids = courses.rows.map((r) => r.id);

    // Enrolments outlive a soft-deleted course and would otherwise show up in
    // dashboards and student lists pointing at a course nobody can open.
    await pool.query(
      `UPDATE enrollments SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE reviews SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE discussion_threads SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE quizzes SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE assignments SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE live_sessions SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    await pool.query(
      `UPDATE financial_entries SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    // Certificates keep their number reserved even once soft-deleted, which is
    // correct — a issued number must never be reused — but they must stop
    // appearing in the student's certificate list.
    await pool.query(
      `UPDATE certificates SET deleted_at = now() WHERE course_id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
  }

  await pool.query(
    `UPDATE categories SET deleted_at = now() WHERE slug = ANY($1) AND deleted_at IS NULL`,
    [LEGACY_CATEGORY_SLUGS],
  );

  await pool.query(
    `UPDATE users SET deleted_at = now() WHERE email = ANY($1) AND deleted_at IS NULL`,
    [LEGACY_EMAILS],
  );

  // The old income rows used this category code; the new seeder uses DEMO-SALES.
  await pool.query(
    `UPDATE financial_entries fe SET deleted_at = now()
       FROM kategori_biaya kb
      WHERE kb.id = fe.kategori_id AND kb.kode = 'PENJUALAN' AND fe.deleted_at IS NULL`,
  );

  if (courses.rowCount) {
    logger.info(`Retired ${courses.rowCount} legacy Indonesian demo courses and their related rows`);
  }
}
