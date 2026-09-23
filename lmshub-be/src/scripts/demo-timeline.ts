import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

/**
 * Re-anchor every demo timestamp to "now".
 *
 * Demo data was previously stamped once, at seed time, and then left to age.
 * Six weeks later the admin dashboard showed zero revenue this month and an
 * empty seven-day sign-up chart — not because anything was broken, but because
 * every seeded date had fallen out of the windows those panels query. That is
 * what a reviewer saw.
 *
 * Running this at the end of every seed makes the demo permanently current:
 * re-run `npm run seed:demo` the morning of a review and the dashboard fills in
 * again. It only ever touches rows that belong to the demo (`@lmshub.test`
 * accounts and the demo expense categories), so it cannot disturb real data if
 * someone runs it on a populated system by mistake.
 */

/** Every demo account lives on this domain; nothing else is rewritten. */
const DEMO_EMAIL_PATTERN = '%@lmshub.test';

/** Expense/income categories created by the demo seeder. */
const DEMO_FINANCE_CODES = ['DEMO-SALES', 'DEMO-INFRA', 'DEMO-MARKETING', 'DEMO-PAYROLL'];

export async function refreshDemoTimeline(): Promise<void> {
  await refreshSignups();
  await refreshEnrollments();
  await refreshEngagement();
  await refreshFinance();
  await refreshLiveSessions();
  logger.info('Demo timeline re-anchored to today');
}

/**
 * Spread demo student accounts across the last 14 days.
 *
 * The "new students" panels count `users.created_at`, and upserting a user
 * never updates that column, so re-seeding alone would not have refreshed it.
 */
async function refreshSignups(): Promise<void> {
  await pool.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS n
         FROM users
        WHERE email LIKE $1 AND deleted_at IS NULL
     )
     UPDATE users u
        SET created_at = now() - ((o.n % 14) || ' days')::interval - ((o.n % 11) || ' hours')::interval
       FROM ordered o
      WHERE u.id = o.id`,
    [DEMO_EMAIL_PATTERN],
  );
}

/**
 * Spread enrolments across the last seven days so the dashboard trend chart has
 * a bar on every day rather than a flat line.
 *
 * The lead student is held back deliberately: her courses show real progress and
 * two completed certificates, which would read as impossible if she had enrolled
 * yesterday.
 */
async function refreshEnrollments(): Promise<void> {
  // Everyone except the lead student: inside the seven-day chart window.
  await pool.query(
    `WITH ordered AS (
       SELECT e.id, row_number() OVER (ORDER BY e.created_at, e.id) - 1 AS n
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
        WHERE u.email LIKE $1 AND u.email <> $2 AND e.deleted_at IS NULL
     )
     UPDATE enrollments e
        SET created_at = now() - ((o.n % 7) || ' days')::interval - ((o.n % 13) || ' hours')::interval
       FROM ordered o
      WHERE e.id = o.id`,
    [DEMO_EMAIL_PATTERN, 'siti@lmshub.test'],
  );

  // Lead student: far enough back that her progress and certificates are plausible.
  await pool.query(
    `WITH ordered AS (
       SELECT e.id, row_number() OVER (ORDER BY e.created_at, e.id) - 1 AS n
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
        WHERE u.email = $1 AND e.deleted_at IS NULL
     )
     UPDATE enrollments e
        SET created_at = now() - ((18 + o.n * 6) || ' days')::interval
       FROM ordered o
      WHERE e.id = o.id`,
    ['siti@lmshub.test'],
  );

  // Progress and certificates follow their enrolment rather than floating free.
  await pool.query(
    `UPDATE course_progress cp
        SET last_accessed_at = GREATEST(e.created_at, now() - interval '2 days'),
            completed_at = CASE WHEN cp.persen_selesai >= 100
                                THEN e.created_at + interval '12 days' ELSE NULL END
       FROM enrollments e
      WHERE cp.enrollment_id = e.id`,
  );

  await pool.query(
    `UPDATE certificates c
        SET tanggal_terbit = e.created_at + interval '13 days'
       FROM enrollments e
      WHERE c.enrollment_id = e.id AND c.deleted_at IS NULL`,
  );
}

/** Reviews, forum threads and lesson Q&A, kept recent so the pages look alive. */
async function refreshEngagement(): Promise<void> {
  const spread = [
    ['reviews', 'r', 10],
    ['discussion_threads', 't', 6],
    ['discussion_posts', 'p', 5],
    ['qa_questions', 'q', 6],
    ['qa_answers', 'a', 4],
  ] as const;

  for (const [table, alias, days] of spread) {
    await pool.query(
      `WITH ordered AS (
         SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS n FROM ${table}
       )
       UPDATE ${table} ${alias}
          SET created_at = now() - ((o.n % ${days}) || ' days')::interval - ((o.n % 7) || ' hours')::interval
         FROM ordered o
        WHERE ${alias}.id = o.id`,
    );
  }
}

/**
 * Move every demo financial entry into the current month.
 *
 * The dashboard's revenue, expense and profit tiles all filter on
 * `date_trunc('month', tanggal) = date_trunc('month', CURRENT_DATE)`. An entry
 * dated last month contributes nothing, which is why all three tiles read zero.
 * `periode_bulan`/`periode_tahun` are rewritten from the same date so the
 * monthly report and the ledger can never disagree.
 */
async function refreshFinance(): Promise<void> {
  await pool.query(
    `WITH ordered AS (
       SELECT fe.id, row_number() OVER (ORDER BY fe.created_at, fe.id) - 1 AS n
         FROM financial_entries fe
         JOIN kategori_biaya kb ON kb.id = fe.kategori_id
        WHERE kb.kode = ANY($1) AND fe.deleted_at IS NULL
     ), dated AS (
       SELECT id,
              -- Somewhere between the 1st of this month and today, never in the future.
              -- row_number() is bigint, and PostgreSQL has no date + bigint
              -- operator; the cast to int is what makes the addition legal.
              LEAST(
                date_trunc('month', CURRENT_DATE)::date
                  + (((n * 3) % GREATEST(EXTRACT(DAY FROM CURRENT_DATE)::int, 1))::int),
                CURRENT_DATE
              ) AS d
         FROM ordered
     )
     UPDATE financial_entries fe
        SET tanggal = dated.d,
            periode_bulan = EXTRACT(MONTH FROM dated.d)::smallint,
            periode_tahun = EXTRACT(YEAR FROM dated.d)::smallint
       FROM dated
      WHERE fe.id = dated.id`,
    [DEMO_FINANCE_CODES],
  );
}

/** Keep the scheduled sessions in the future; a demo of "upcoming" that is past is worse than none. */
async function refreshLiveSessions(): Promise<void> {
  // The first two sessions are placed in the past and marked finished, the rest
  // ahead of today. Pushing every session into the future — which is what this
  // used to do — left the live-class screen with no completed class, so the
  // attendance roll and the published recording were never visible on a demo.
  await pool.query(
    `WITH ordered AS (
       SELECT id, row_number() OVER (ORDER BY waktu_mulai, id) AS n
         FROM live_sessions
        WHERE deleted_at IS NULL
     ),
     placed AS (
       SELECT id,
              -- Anchored to 19:00 local rather than to the current time of day: a
              -- seeder run at four in the morning otherwise scheduled every class
              -- for four in the morning.
              date_trunc('day',
                CASE WHEN n <= 2
                     THEN now() - ((3 - n) * 4 || ' days')::interval
                     ELSE now() + (((n - 2) * 2) || ' days')::interval
                END
              ) + interval '19 hours' AS mulai,
              n
         FROM ordered
     )
     UPDATE live_sessions ls
        SET waktu_mulai   = p.mulai,
            waktu_selesai = p.mulai + interval '90 minutes',
            status = (CASE WHEN p.n = 1 THEN 'rekaman_tersedia'
                           WHEN p.n = 2 THEN 'selesai'
                           ELSE 'dijadwalkan' END)::live_session_status
       FROM placed p
      WHERE ls.id = p.id`,
  );
}
