import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── Tipe baris ──────────────────────────────────────────────

export interface OrderRow {
  id: string;
  buyer_user_id: string;
  jalur: 'online' | 'manual';
  marketing_user_id: string | null;
  status: 'menunggu_pembayaran' | 'dp_cicilan_berjalan' | 'lunas' | 'akses_aktif' | 'batal';
  coupon_id: string | null;
  subtotal: string;
  diskon: string;
  total: string;
  checkout_kedaluwarsa_at: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A row of the transaction list. The list screen shows who bought what, which
 * the `orders` table alone cannot answer — the buyer is a foreign key and the
 * course sits one level down in `order_items` — so those names are joined in
 * here rather than left for the client to resolve per row.
 */
export interface OrderListRow extends OrderRow {
  kode: string;
  pembeli_nama: string | null;
  pembeli_email: string | null;
  kursus_nama: string | null;
  marketing_nama: string | null;
  jumlah_item: number;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_tipe: 'kursus' | 'bundle' | 'path' | 'langganan';
  course_id: string | null;
  learning_path_id: string | null;
  bundle_group_id: string | null;
  harga_satuan: string;
  kuantitas: number;
  subtotal: string;
  meta: unknown;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  jenis: 'penuh' | 'dp' | 'cicilan';
  nominal: string;
  metode: string;
  status: 'menunggu_verifikasi' | 'terverifikasi' | 'ditolak';
  bukti_media_id: string | null;
  referensi_gateway: string | null;
  verified_by: string | null;
  verified_at: string | null;
  catatan_verifikasi: string | null;
  created_at: string;
}

export interface CouponRow {
  id: string;
  kode: string;
  tipe_potongan: 'persen' | 'nominal';
  nilai_potongan: string;
  kuota_maksimal: number | null;
  kuota_terpakai: number;
  minimum_pembelian: string | null;
  berlaku_mulai: string | null;
  berlaku_sampai: string | null;
  is_aktif: boolean;
}

export interface CourseRow {
  id: string;
  harga: string;
  instructor_id: string;
}

export interface LearningPathRow {
  id: string;
  harga_bundle: string | null;
}

export interface InstructorProfileRow {
  id: string;
  revenue_share_percent: string | null;
}

export interface Filters {
  status?: string;
  jalur?: string;
  /** Free text across buyer name, buyer email and course title. */
  q?: string;
  buyer_user_id?: string;
  marketing_user_id?: string;
}

const runner = (tx?: PoolClient) => tx ?? pool;

// ── Orders ──────────────────────────────────────────────────

export async function list(p: PageParams, f: Filters): Promise<{ rows: OrderListRow[]; total: number }> {
  const where: string[] = ['o.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.status) add('o.status = $?', f.status);
  if (f.jalur) add('o.jalur = $?', f.jalur);
  if (f.buyer_user_id) add('o.buyer_user_id = $?', f.buyer_user_id);
  if (f.marketing_user_id) add('o.marketing_user_id = $?', f.marketing_user_id);
  if (f.q?.trim()) {
    const term = `%${f.q.trim()}%`;
    params.push(term);
    const i = params.length;
    where.push(
      `(b.nama_lengkap ILIKE $${i} OR b.email ILIKE $${i}
        OR EXISTS (SELECT 1 FROM order_items oi JOIN courses c ON c.id = oi.course_id
                    WHERE oi.order_id = o.id AND c.judul ILIKE $${i}))`,
    );
  }

  const whereSql = where.join(' AND ');
  const sortCol = ['created_at', 'total', 'status'].includes(p.sort ?? '') ? p.sort : 'created_at';
  // A ledger is read newest-first. The shared pagination helper defaults to
  // ascending, which buried today's orders on the last page.
  const sortDir = p.sort ? p.order : 'DESC';

  // The order has no stored reference number, so one is derived from the date and
  // the head of the id — stable for a given order, and short enough to read out
  // over the phone, which is what the column is for.
  const rows = await query<OrderListRow>(
    `SELECT o.*,
            'ORD-' || to_char(o.created_at, 'YYMMDD') || '-' || upper(left(o.id::text, 6)) AS kode,
            b.nama_lengkap AS pembeli_nama,
            b.email        AS pembeli_email,
            m.nama_lengkap AS marketing_nama,
            first_item.judul AS kursus_nama,
            COALESCE(item_count.n, 0) AS jumlah_item
       FROM orders o
       LEFT JOIN users b ON b.id = o.buyer_user_id
       LEFT JOIN users m ON m.id = o.marketing_user_id
       LEFT JOIN LATERAL (
         SELECT c.judul
           FROM order_items oi
           JOIN courses c ON c.id = oi.course_id
          WHERE oi.order_id = o.id
          ORDER BY oi.created_at
          LIMIT 1
       ) first_item ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS n FROM order_items oi WHERE oi.order_id = o.id
       ) item_count ON true
      WHERE ${whereSql}
      ORDER BY o.${sortCol} ${sortDir}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count
       FROM orders o
       LEFT JOIN users b ON b.id = o.buyer_user_id
      WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function findById(id: string, tx?: PoolClient): Promise<OrderRow | null> {
  const res = await runner(tx).query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

export async function insertOrder(
  data: {
    buyer_user_id: string;
    jalur: 'online' | 'manual';
    marketing_user_id: string | null;
    coupon_id: string | null;
    subtotal: number;
    diskon: number;
    total: number;
    checkout_kedaluwarsa_at: Date | null;
    catatan: string | null;
  },
  tx: PoolClient,
): Promise<OrderRow> {
  const res = await tx.query<OrderRow>(
    `INSERT INTO orders (buyer_user_id, jalur, marketing_user_id, coupon_id, subtotal, diskon, total, checkout_kedaluwarsa_at, catatan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.buyer_user_id,
      data.jalur,
      data.marketing_user_id,
      data.coupon_id,
      data.subtotal,
      data.diskon,
      data.total,
      data.checkout_kedaluwarsa_at,
      data.catatan,
    ],
  );
  return res.rows[0];
}

export async function updateOrderStatus(id: string, status: OrderRow['status'], tx: PoolClient): Promise<void> {
  await tx.query(`UPDATE orders SET status = $2 WHERE id = $1`, [id, status]);
}

export async function lockOrderForUpdate(id: string, tx: PoolClient): Promise<OrderRow | null> {
  const res = await tx.query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
  return res.rows[0] ?? null;
}

// ── Order items ─────────────────────────────────────────────

export async function insertOrderItem(
  data: {
    order_id: string;
    item_tipe: OrderItemRow['item_tipe'];
    course_id: string | null;
    learning_path_id: string | null;
    bundle_group_id: string | null;
    harga_satuan: number;
    kuantitas: number;
    subtotal: number;
    meta: unknown;
  },
  tx: PoolClient,
): Promise<OrderItemRow> {
  const res = await tx.query<OrderItemRow>(
    `INSERT INTO order_items (order_id, item_tipe, course_id, learning_path_id, bundle_group_id, harga_satuan, kuantitas, subtotal, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.order_id,
      data.item_tipe,
      data.course_id,
      data.learning_path_id,
      data.bundle_group_id,
      data.harga_satuan,
      data.kuantitas,
      data.subtotal,
      data.meta ? JSON.stringify(data.meta) : null,
    ],
  );
  return res.rows[0];
}

export async function itemsByOrder(orderId: string, tx?: PoolClient): Promise<OrderItemRow[]> {
  const res = await runner(tx).query<OrderItemRow>(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at`, [
    orderId,
  ]);
  return res.rows;
}

// ── Coupons ─────────────────────────────────────────────────

export async function couponByKode(kode: string): Promise<CouponRow | null> {
  return queryOne<CouponRow>(`SELECT * FROM coupons WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
}

export async function incrementCouponUsage(id: string, tx: PoolClient): Promise<void> {
  await tx.query(`UPDATE coupons SET kuota_terpakai = kuota_terpakai + 1 WHERE id = $1`, [id]);
}

export async function releaseCouponUsage(id: string, tx: PoolClient): Promise<void> {
  await tx.query(`UPDATE coupons SET kuota_terpakai = GREATEST(kuota_terpakai - 1, 0) WHERE id = $1`, [id]);
}

// ── Katalog lookups (read-only, dari domain 02) ────────────

export async function courseById(id: string, tx?: PoolClient): Promise<CourseRow | null> {
  const res = await runner(tx).query<CourseRow>(
    `SELECT id, harga, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function learningPathById(id: string, tx?: PoolClient): Promise<LearningPathRow | null> {
  const res = await runner(tx).query<LearningPathRow>(
    `SELECT id, harga_bundle FROM learning_paths WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function pathCourseIds(pathId: string, tx?: PoolClient): Promise<string[]> {
  const res = await runner(tx).query<{ course_id: string }>(`SELECT course_id FROM path_courses WHERE path_id = $1`, [
    pathId,
  ]);
  return res.rows.map((r) => r.course_id);
}

export async function instructorProfileById(id: string, tx?: PoolClient): Promise<InstructorProfileRow | null> {
  const res = await runner(tx).query<InstructorProfileRow>(
    `SELECT id, revenue_share_percent FROM instructor_profiles WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return res.rows[0] ?? null;
}

// ── Payments ────────────────────────────────────────────────

export async function insertPayment(
  data: {
    order_id: string;
    jenis: PaymentRow['jenis'];
    nominal: number;
    metode: string;
    status: PaymentRow['status'];
    bukti_media_id: string | null;
    referensi_gateway: string | null;
    verified_by: string | null;
    verified_at: Date | null;
    catatan_verifikasi: string | null;
  },
  tx: PoolClient,
): Promise<PaymentRow> {
  const res = await tx.query<PaymentRow>(
    `INSERT INTO payments (order_id, jenis, nominal, metode, status, bukti_media_id, referensi_gateway, verified_by, verified_at, catatan_verifikasi)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.order_id,
      data.jenis,
      data.nominal,
      data.metode,
      data.status,
      data.bukti_media_id,
      data.referensi_gateway,
      data.verified_by,
      data.verified_at,
      data.catatan_verifikasi,
    ],
  );
  return res.rows[0];
}

export async function paymentById(id: string, tx?: PoolClient): Promise<PaymentRow | null> {
  const res = await runner(tx).query<PaymentRow>(`SELECT * FROM payments WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

/**
 * Cari pembayaran lewat referensi milik gateway. Dipakai webhook yang hanya
 * mengembalikan id miliknya sendiri (mis. PayPal order id) alih-alih `payments.id`.
 */
export async function paymentByGatewayRef(ref: string, tx?: PoolClient): Promise<PaymentRow | null> {
  const res = await runner(tx).query<PaymentRow>(
    `SELECT * FROM payments WHERE referensi_gateway = $1 AND deleted_at IS NULL`,
    [ref],
  );
  return res.rows[0] ?? null;
}

export async function updatePaymentVerification(
  id: string,
  data: { status: PaymentRow['status']; verified_by: string | null; verified_at: Date; catatan_verifikasi: string | null },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `UPDATE payments SET status = $2, verified_by = $3, verified_at = $4, catatan_verifikasi = $5 WHERE id = $1`,
    [id, data.status, data.verified_by, data.verified_at, data.catatan_verifikasi],
  );
}

export async function sumVerifiedPayments(orderId: string, tx?: PoolClient): Promise<number> {
  const res = await runner(tx).query<{ sum: string }>(
    `SELECT COALESCE(SUM(nominal),0)::numeric AS sum FROM payments WHERE order_id = $1 AND status = 'terverifikasi' AND deleted_at IS NULL`,
    [orderId],
  );
  return Number(res.rows[0]?.sum ?? 0);
}

export async function paymentsByOrder(orderId: string, tx?: PoolClient): Promise<PaymentRow[]> {
  const res = await runner(tx).query<PaymentRow>(
    `SELECT * FROM payments WHERE order_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [orderId],
  );
  return res.rows;
}

// ── Invoices ────────────────────────────────────────────────

export async function invoiceByOrder(orderId: string): Promise<{ id: string; nomor_invoice: string; diterbitkan_at: string } | null> {
  return queryOne(`SELECT id, nomor_invoice, diterbitkan_at FROM invoices WHERE order_id = $1 AND deleted_at IS NULL`, [
    orderId,
  ]);
}

export async function countInvoicesInPeriod(year: number, month: number): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM invoices
      WHERE EXTRACT(YEAR FROM diterbitkan_at) = $1 AND EXTRACT(MONTH FROM diterbitkan_at) = $2`,
    [year, month],
  );
  return Number(row?.count ?? 0);
}

export async function insertInvoice(
  data: { order_id: string; nomor_invoice: string },
  tx?: PoolClient,
): Promise<{ id: string; nomor_invoice: string; diterbitkan_at: string }> {
  const res = await runner(tx).query<{ id: string; nomor_invoice: string; diterbitkan_at: string }>(
    `INSERT INTO invoices (order_id, nomor_invoice) VALUES ($1,$2) RETURNING id, nomor_invoice, diterbitkan_at`,
    [data.order_id, data.nomor_invoice],
  );
  return res.rows[0];
}

// ── Revenue shares (finansial) ──────────────────────────

export async function insertRevenueShare(
  data: {
    course_id: string;
    instructor_id: string;
    order_item_id: string;
    persen_share: number;
    nominal_share: number;
    nominal_platform: number;
    periode: string;
  },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `INSERT INTO revenue_shares (course_id, instructor_id, order_item_id, persen_share, nominal_share, nominal_platform, periode, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'dihitung')`,
    [
      data.course_id,
      data.instructor_id,
      data.order_item_id,
      data.persen_share,
      data.nominal_share,
      data.nominal_platform,
      data.periode,
    ],
  );
}

export async function softDeleteRevenueSharesByOrder(orderId: string, tx: PoolClient): Promise<void> {
  await tx.query(
    `UPDATE revenue_shares SET deleted_at = now()
      WHERE deleted_at IS NULL AND order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)`,
    [orderId],
  );
}

// ── Enrollments ( dibuat saat order lunas) ───────────────

export async function insertEnrollment(
  data: { user_id: string; course_id: string; sumber: string; order_item_id: string },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `INSERT INTO enrollments (user_id, course_id, sumber, status, order_item_id)
     VALUES ($1,$2,$3,'aktif',$4)
     ON CONFLICT DO NOTHING`,
    [data.user_id, data.course_id, data.sumber, data.order_item_id],
  );
}

export async function cancelEnrollmentsByOrder(orderId: string, tx: PoolClient): Promise<void> {
  await tx.query(
    `UPDATE enrollments SET status = 'batal'
      WHERE deleted_at IS NULL AND order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)`,
    [orderId],
  );
}

// ── Refunds (finansial — approval Direktur) ──────────────

export async function insertRefund(
  data: {
    order_id: string;
    nominal: number;
    alasan: string;
    status: 'diajukan' | 'disetujui' | 'ditolak' | 'diproses' | 'selesai';
    diajukan_oleh: string;
    disetujui_oleh: string | null;
    disetujui_at: Date | null;
    diproses_at: Date | null;
    metode_pengembalian: string | null;
    catatan: string | null;
  },
  tx: PoolClient,
) {
  const res = await tx.query(
    `INSERT INTO refunds (order_id, nominal, alasan, status, diajukan_oleh, disetujui_oleh, disetujui_at, diproses_at, metode_pengembalian, catatan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.order_id,
      data.nominal,
      data.alasan,
      data.status,
      data.diajukan_oleh,
      data.disetujui_oleh,
      data.disetujui_at,
      data.diproses_at,
      data.metode_pengembalian,
      data.catatan,
    ],
  );
  return res.rows[0];
}
