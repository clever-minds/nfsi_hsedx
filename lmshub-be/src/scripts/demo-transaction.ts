import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

/**
 * DEMO COMMERCE — orders, payments, invoices, revenue share, payouts, live-class
 * attendance and a notification history.
 *
 * The rest of the demo seeder builds a catalogue and enrols students into it, but
 * it never recorded how any of them paid. That left Transactions, Payouts and the
 * financial reports empty on a freshly seeded site, which reads as though the
 * commerce side of the product does not exist.
 *
 * Every order here is derived from an enrolment that already exists, so the demo
 * stays internally consistent: a student has access because a paid order granted
 * it. A handful of extra orders cover the states an enrolment cannot produce —
 * awaiting payment, an instalment in progress, a manual transfer waiting for an
 * admin to confirm it, and a cancelled order.
 *
 * Idempotent, and scoped to demo accounts (`%@lmshub.test`) exactly like
 * `demo-timeline`. Re-running it rebuilds the commerce history from scratch
 * without touching anything a real buyer created.
 */

const DEMO_EMAIL_PATTERN = '%@lmshub.test';

/** Share of each sale that goes to the instructor; the platform keeps the rest. */
const INSTRUCTOR_SHARE_PERCENT = 60;

/** Gateways cycled through so every configured provider appears in the list. */
const GATEWAYS = ['stripe', 'midtrans', 'paypal', 'razorpay', 'paystack', 'mollie', 'flutterwave', 'easebuzz'];

type PaidRow = {
  enrollment_id: string;
  user_id: string;
  course_id: string;
  instructor_id: string;
  price: string;
};

type Candidate = { user_id: string; course_id: string; instructor_id: string; price: string };

/** `YYYY-MM` bucket used by revenue share and payout periods. */
function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function installDemoTransactions(): Promise<void> {
  await clearPreviousRun();

  const paid = await buildPaidOrders();
  const open = await buildOpenOrders();
  await buildPayouts();
  await buildAttendance();
  await buildNotifications();

  logger.info(
    { lunas: paid, terbuka: open },
    'Demo commerce ready — orders, payments, invoices, revenue share and payouts',
  );
}

/**
 * Remove what a previous run created, so re-seeding does not stack duplicate
 * orders on top of the ones already there. Deleting the orders is not enough:
 * enrolments pointst back at the order items, and that reference has to be cleared
 * before the rows can go.
 */
async function clearPreviousRun(): Promise<void> {
  const scope = `SELECT o.id FROM orders o JOIN users u ON u.id = o.buyer_user_id
                 WHERE u.email LIKE '${DEMO_EMAIL_PATTERN}'`;

  await pool.query(
    `UPDATE enrollments SET order_item_id = NULL
      WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (${scope}))`,
  );
  await pool.query(
    `DELETE FROM revenue_shares
      WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (${scope}))`,
  );
  await pool.query(`DELETE FROM instructor_payouts`);
  await pool.query(`DELETE FROM invoices WHERE order_id IN (${scope})`);
  await pool.query(`DELETE FROM payments WHERE order_id IN (${scope})`);
  await pool.query(`DELETE FROM order_items WHERE order_id IN (${scope})`);
  await pool.query(`DELETE FROM orders WHERE id IN (${scope})`);
  await pool.query(
    `DELETE FROM session_attendance WHERE user_id IN
       (SELECT id FROM users WHERE email LIKE '${DEMO_EMAIL_PATTERN}')`,
  );
  await pool.query(`DELETE FROM notifications WHERE source_type = 'demo'`);
}

/**
 * Give every existing enrolment on a paid course the order that bought it.
 *
 * The order, its item, the verified payment and the invoice are all dated to the
 * day the student enrolled, so the financial report and the enrolment list tell
 * the same story.
 */
async function buildPaidOrders(): Promise<number> {
  const { rows } = await pool.query<PaidRow>(
    `SELECT e.id AS enrollment_id, e.user_id, e.course_id, c.instructor_id, c.price
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users  u ON u.id = e.user_id
      WHERE c.price > 0
        AND e.deleted_at IS NULL
        AND e.order_item_id IS NULL
        AND u.email LIKE $1
      ORDER BY e.created_at`,
    [DEMO_EMAIL_PATTERN],
  );

  let invoiceSeq = 1;
  for (const [i, row] of rows.entries()) {
    const price = Number(row.price);
    const placed = daysAgo(2 + i * 3);
    const gateway = GATEWAYS[i % GATEWAYS.length];

    const order = await insertOrder({
      buyer_user_id: row.user_id,
      channel: 'online',
      status: 'paid_in_full',
      total: price,
      at: placed,
      notes: null,
    });

    const item = await insertItem(order, row.course_id, price);

    await pool.query(
      `INSERT INTO payments (order_id, type, amount, method, status, gateway_reference,
                             verified_at, created_at, updated_at)
       VALUES ($1,'full',$2,$3,'verified',$4,$5,$5,$5)`,
      [order, price, gateway, `${gateway.toUpperCase()}-${placed.getTime()}`, placed],
    );

    await pool.query(
      `INSERT INTO invoices (order_id, number_invoice, issued_at, created_at, updated_at)
       VALUES ($1,$2,$3,$3,$3)`,
      [order, `INV-${periodOf(placed).replace('-', '')}-${String(invoiceSeq++).padStart(4, '0')}`, placed],
    );

    await insertRevenueShare(row.course_id, row.instructor_id, item, price, placed);

    await pool.query(`UPDATE enrollments SET order_item_id = $1 WHERE id = $2`, [
      item,
      row.enrollment_id,
    ]);
  }

  return rows.length;
}

/**
 * Orders in the states an enrolment cannot represent, so the status filter on the
 * Transactions screen has something behind every option: awaiting payment, an
 * instalment part-paid, a manual transfer a student has submitted proof for, and
 * one cancelled order.
 *
 * These deliberately do not grant access — nothing is enrolled by them.
 */
async function buildOpenOrders(): Promise<number> {
  // Students only — an administrator appearing as the buyer of a course reads as
  // test data. And each buyer is offset onto a different course, so the list does
  // not repeat one title down every open row.
  const { rows } = await pool.query<Candidate>(
    `WITH pembeli AS (
       SELECT u.id, row_number() OVER (ORDER BY u.created_at) - 1 AS n
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.email LIKE $1 AND u.deleted_at IS NULL AND r.kode = 'student'
     )
     SELECT p.id AS user_id, c.id AS course_id, c.instructor_id, c.price
       FROM pembeli p
       CROSS JOIN LATERAL (
         SELECT c.id, c.instructor_id, c.price FROM courses c
          WHERE c.price > 0 AND c.deleted_at IS NULL
            AND c.publication_status = 'publish'
            AND NOT EXISTS (SELECT 1 FROM enrollments e
                             WHERE e.course_id = c.id AND e.user_id = p.id
                               AND e.deleted_at IS NULL)
          ORDER BY c.title
          OFFSET p.n LIMIT 1
       ) c
      ORDER BY p.n
      LIMIT 6`,
    [DEMO_EMAIL_PATTERN],
  );

  if (!rows.length) return 0;

  const plans: Array<{
    status: string;
    channel: 'online' | 'manual';
    notes: string | null;
    /** null = no payment row at all (the student never got as far as paying) */
    payment: { type: string; bagian: number; method: string; status: string } | null;
  }> = [
    {
      status: 'awaiting_payment',
      channel: 'online',
      notes: null,
      payment: null,
    },
    {
      status: 'awaiting_payment',
      channel: 'manual',
      notes: 'Bank transfer — proof uploaded, awaiting admin confirmation',
      payment: { type: 'full', bagian: 1, method: 'manual', status: 'awaiting_verification' },
    },
    {
      status: 'installment_running',
      channel: 'online',
      notes: 'Instalment plan — 3 monthly payments',
      payment: { type: 'down_payment', bagian: 0.4, method: 'stripe', status: 'verified' },
    },
    {
      status: 'installment_running',
      channel: 'manual',
      notes: 'Instalment plan — down payment received at the front desk',
      payment: { type: 'down_payment', bagian: 0.5, method: 'manual', status: 'verified' },
    },
    {
      status: 'cancelled',
      channel: 'online',
      notes: 'Cancelled — checkout window expired before payment',
      payment: null,
    },
    {
      status: 'awaiting_payment',
      channel: 'manual',
      notes: 'Invoice issued to a corporate buyer, net 14 days',
      payment: null,
    },
  ];

  let made = 0;
  for (const [i, row] of rows.entries()) {
    const plan = plans[i % plans.length];
    const price = Number(row.price);
    const placed = daysAgo(1 + i * 2);

    const order = await insertOrder({
      buyer_user_id: row.user_id,
      channel: plan.channel,
      status: plan.status,
      total: price,
      at: placed,
      notes: plan.notes,
    });
    await insertItem(order, row.course_id, price);

    if (plan.payment) {
      const amount = Math.round(price * plan.payment.bagian * 100) / 100;
      await pool.query(
        `INSERT INTO payments (order_id, type, amount, method, status, gateway_reference,
                               verified_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          order,
          plan.payment.type,
          amount,
          plan.payment.method,
          plan.payment.status,
          plan.payment.method === 'manual' ? null : `${plan.payment.method.toUpperCase()}-${placed.getTime()}`,
          plan.payment.status === 'verified' ? placed : null,
          placed,
        ],
      );
    }
    made++;
  }

  return made;
}

async function insertOrder(data: {
  buyer_user_id: string;
  channel: 'online' | 'manual';
  status: string;
  total: number;
  at: Date;
  notes: string | null;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders (buyer_user_id, channel, status, subtotal, discount, total,
                         checkout_expired_at, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,0,$4,$5,$6,$7,$7)
     RETURNING id`,
    [
      data.buyer_user_id,
      data.channel,
      data.status,
      data.total,
      data.status === 'awaiting_payment' ? daysAgo(-7) : null,
      data.notes,
      data.at,
    ],
  );
  return rows[0].id;
}

async function insertItem(orderId: string, courseId: string, price: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO order_items (order_id, item_type, course_id, price_unit, quantity, subtotal)
     VALUES ($1,'course',$2,$3,1,$3)
     RETURNING id`,
    [orderId, courseId, price],
  );
  return rows[0].id;
}

async function insertRevenueShare(
  courseId: string,
  instructorId: string,
  orderItemId: string,
  price: number,
  at: Date,
): Promise<void> {
  const share = Math.round(price * (INSTRUCTOR_SHARE_PERCENT / 100) * 100) / 100;
  await pool.query(
    `INSERT INTO revenue_shares (course_id, instructor_id, order_item_id, share_percentage,
                                 amount_share, amount_platform, period, status,
                                 created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'calculated',$8,$8)`,
    [
      courseId,
      instructorId,
      orderItemId,
      INSTRUCTOR_SHARE_PERCENT,
      share,
      Math.round((price - share) * 100) / 100,
      periodOf(at),
      at,
    ],
  );
}

/**
 * Roll the revenue share up into one payout per instructor per month, and walk
 * the older months further along the approval chain so the payout screen shows
 * the whole lifecycle rather than a column of identical rows.
 */
async function buildPayouts(): Promise<void> {
  // `instructor_id` addresses an instructor_profiles row, but the columns recording
  // who filed and who approved a payout address users — so the profile's own user
  // has to be carried along to stand in as the requester.
  const { rows } = await pool.query<{
    instructor_id: string;
    user_id: string;
    period: string;
    total: string;
  }>(
    `SELECT rs.instructor_id, ip.user_id, rs.period, SUM(rs.amount_share)::numeric AS total
       FROM revenue_shares rs
       JOIN instructor_profiles ip ON ip.id = rs.instructor_id
      WHERE rs.deleted_at IS NULL
      GROUP BY rs.instructor_id, ip.user_id, rs.period
      ORDER BY rs.period DESC, total DESC`,
  );

  // Cycle the lifecycle rather than walking it once and leaving every remaining
  // row at the final state, which would fill the screen with identical entries.
  const chain = ['completed', 'awaiting_approval', 'completed', 'approved', 'completed', 'disbursement'];
  const admin = await firstUserWithRole('super_admin');

  for (const [i, row] of rows.entries()) {
    const status = i === 0 ? 'calculated' : chain[(i - 1) % chain.length];
    const settled = status === 'completed' || status === 'disbursement';

    const { rows: made } = await pool.query<{ id: string }>(
      `INSERT INTO instructor_payouts (instructor_id, period, total_amount, status,
                                       submitted_by, approved_by, approved_at,
                                       disbursed_at, method_pencairan, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        row.instructor_id,
        row.period,
        row.total,
        status,
        row.user_id,
        status === 'calculated' || status === 'awaiting_approval' ? null : admin,
        status === 'calculated' || status === 'awaiting_approval' ? null : daysAgo(10),
        settled ? daysAgo(4) : null,
        settled ? 'Bank transfer' : null,
        status === 'completed' ? 'Disbursed and confirmed by the instructor' : null,
      ],
    );

    await pool.query(
      `UPDATE revenue_shares SET instructor_payout_id = $1
        WHERE instructor_id = $2 AND period = $3 AND deleted_at IS NULL`,
      [made[0].id, row.instructor_id, row.period],
    );
  }
}

/**
 * Attendance for live sessions that have already happened, mixing on-time,
 * late and absent so the roll-call screen shows what each state looks like.
 */
async function buildAttendance(): Promise<void> {
  const { rows } = await pool.query<{ id: string; course_id: string; start_time: Date }>(
    `SELECT id, course_id, start_time FROM live_sessions
      WHERE start_time < now() AND deleted_at IS NULL
      ORDER BY start_time DESC`,
  );

  // A running pattern, continued across sessions rather than restarted for each
  // one. Indexing within a session would never reach the later entries, because
  // a demo class only has a handful of students.
  const PATTERN = ['present', 'late', 'present', 'present', 'absent', 'present', 'late'];
  let seat = 0;

  for (const session of rows) {
    const { rows: students } = await pool.query<{ user_id: string }>(
      `SELECT e.user_id FROM enrollments e
         JOIN users u ON u.id = e.user_id
        WHERE e.course_id = $1 AND e.deleted_at IS NULL AND u.email LIKE $2
        ORDER BY e.created_at
        LIMIT 12`,
      [session.course_id, DEMO_EMAIL_PATTERN],
    );

    for (const s of students) {
      const status = PATTERN[seat++ % PATTERN.length];
      if (status === 'absent') {
        await pool.query(
          `INSERT INTO session_attendance (live_session_id, user_id, status, durasi_hadir_menit, ditandai_manual)
           VALUES ($1,$2,'absent',0,false)`,
          [session.id, s.user_id],
        );
        continue;
      }
      const join = new Date(session.start_time);
      join.setMinutes(join.getMinutes() + (status === 'late' ? 14 : 1));
      const leave = new Date(join);
      leave.setMinutes(leave.getMinutes() + 55);

      await pool.query(
        `INSERT INTO session_attendance (live_session_id, user_id, status, time_join, time_leave,
                                         durasi_hadir_menit, ditandai_manual)
         VALUES ($1,$2,$3,$4,$5,55,false)`,
        [session.id, s.user_id, status, join, leave],
      );
    }
  }
}

/** A short notification history so the notification centre is not an empty page. */
async function buildNotifications(): Promise<void> {
  // `event_type` is a foreign key into notification_event_config, so only codes
  // that catalogue already defines can be used here.
  const events: Array<[string, string, string, number]> = [
    ['payment.terverifikasi', 'Payment verified', 'An order was paid in full and access was granted.', 1],
    ['order.manual_masuk', 'Manual transfer submitted', 'A student uploaded proof of a bank transfer for review.', 2],
    ['live_session.h1', 'Live class starting soon', 'A live session begins in one hour.', 3],
    ['assignment.dikumpulkan', 'Assignment submitted', 'A submission is waiting in the grading queue.', 4],
    ['value.dirilis', 'Grades released', 'Results for a quiz are now visible to the class.', 5],
    ['certificate.publish', 'Certificate issued', 'A student completed a course and earned a certificate.', 6],
    ['commission.cair', 'Commission paid', 'An affiliate commission was disbursed.', 7],
    ['invoice.due_date', 'Instalment due', 'The next instalment on an order falls due tomorrow.', 8],
    ['student.mendaftar', 'New student registered', 'A new account finished email verification.', 9],
  ];

  for (const [type, title, content, hari] of events) {
    await pool.query(
      `INSERT INTO notifications (event_type, title, content, source_type, time, created_at, updated_at)
       VALUES ($1,$2,$3,'demo',$4,$4,$4)`,
      [type, title, content, daysAgo(hari)],
    );
  }
}

async function firstUserWithRole(kode: string): Promise<string | null> {
  // The primary role lives on `users.role_id`; `user_roles` only holds additional
  // roles granted on top of it, and is empty on a stock install.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE r.kode = $1 AND u.deleted_at IS NULL
      ORDER BY u.created_at
      LIMIT 1`,
    [kode],
  );
  return rows[0]?.id ?? null;
}
