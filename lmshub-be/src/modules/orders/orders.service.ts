import { PoolClient } from 'pg';
import { AppError } from '../../core/http/AppError';
import { withTransaction } from '../../core/db/withTransaction';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import { query } from '../../core/db/pool';
import { logger } from '../../core/logger/logger';
import { env, isProd } from '../../core/config/env';
import { listActive as listActiveBankAccounts } from '../bank-accounts/bank-accounts.repository';
import { availableProviders, getProvider } from '../../core/payment/registry';
import { ensurePaymentSettings, manualTransferEnabled } from '../../core/payment/config';
import type { PaymentProvider, WebhookRequest } from '../../core/payment/types';
import { getSetting } from '../../core/settings/settings';
import * as repo from './orders.repository';
import { OrderRow } from './orders.repository';
import * as marketingService from '../marketing/marketing.service';
import { CheckoutInput, ManualOrderInput, OrderItemInput, PayInput, RefundInput, VerifyPaymentInput } from './orders.validation';

// Finansial: fallback revenue share instructor (README §"revenue share 60:40") bila
// `instructor_profiles.revenue_share_percent` (override) no diisi. Final via `settings` (domain 12).
const DEFAULT_INSTRUCTOR_SHARE_PERCENT = 60;
// Timeout checkout default (menit) — placeholder until `settings.checkout_timeout_minutes` tersedia (domain 12).
const DEFAULT_CHECKOUT_TIMEOUT_MINUTES = 24 * 60;

const round2 = (n: number) => Math.round(n * 100) / 100;

const isAdminLike = (actor: AuthContext) =>
  actor.roles.includes('super_admin') || actor.roles.includes('director') || actor.roles.includes('operations_admin');
const isMarketing = (actor: AuthContext) => actor.roles.includes('marketing');
const isDirektur = (actor: AuthContext) => actor.roles.includes('super_admin') || actor.roles.includes('director');

/**
 * Metode luar-jaringan yang boleh dicatat lewat `POST /orders/:id/pay`.
 *
 * Endpointst itu hanya MENCATAT klaim payment; no ada uang yang berpindah
 * di dalamnya. Karena itu setiap notes login sebagai `menunggu_verifikasi`
 * dan baru melunasi order setelah seseorang ber-izin `payment.update`
 * menyetujuinya di layar Transaction.
 *
 * Metode gateway (kartu, VA, e-wallet, QRIS) sengaja no ada di register ini.
 * Untuk method tersebut satu-satunya proof uang sudah login adalah webhook
 * provider yang tertandatangani, dan channelnya `POST /orders/:id/pay-gateway`.
 * previous keempatnya diterima di sini dan langsung ditandai terverifikasi
 * sebagai "simulasi gateway" — artinya siapa pun yang boleh membuat order bisa
 * melunasinya sendiri tanpa membayar.
 */
const METODE_OFFLINE = new Set(['transfer_bank', 'tunai', 'other']);

function periodeNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Penyusunan item & kupon ──────────────────────────────────

/**
 * Tipe item yang pricenya DIPASOK KLIEN, bukan diturunkan from catalog.
 *
 * Untuk `course`, `bundle` dan `path`, `resolveItems()` membaca price from basis
 * data dan mengabaikan apa pun yang dikirim pembeli. `langganan` belum punya
 * catalog package tersendiri, jadi pricenya datang from request.
 *
 * Himpunan ini ada supaya keputusan "total nol boleh dipercaya" (view
 * `checkout()`) no pernah lepas sinkron from kenyataan di `resolveItems()`.
 * Tanpa itu, satu baris langganan berprice 0 cukup untuk mencetak order lunas
 * sendiri. Dijaga `tests/unit/security-guards.test.ts`.
 */
export const TIPE_HARGA_DARI_KLIEN = new Set<OrderItemInput['item_type']>(['subscription']);

/** Seluruh price order ini diturunkan server from catalog? */
export const priceSepenuhnyaDariKatalog = (items: OrderItemInput[]): boolean =>
  items.every((i) => !TIPE_HARGA_DARI_KLIEN.has(i.item_type));

interface ResolvedItem {
  item_type: OrderItemInput['item_type'];
  course_id: string | null;
  learning_path_id: string | null;
  bundle_group_id: string | null;
  price_unit: number;
  quantity: number;
  subtotal: number;
  meta: unknown;
}

async function resolveItems(items: OrderItemInput[]): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  for (const item of items) {
    let priceSatuan = 0;
    if (item.item_type === 'course' || item.item_type === 'bundle') {
      const course = await repo.courseById(item.course_id!);
      if (!course) throw AppError.badRequest(`Course ${item.course_id} was not found`, 'course.not_found');
      priceSatuan = Number(course.price);
    } else if (item.item_type === 'path') {
      const path = await repo.learningPathById(item.learning_path_id!);
      if (!path) throw AppError.badRequest(`Learning path ${item.learning_path_id} was not found`, 'learning_path.not_found');
      if (path.price_bundle == null) throw AppError.badRequest('This learning path is not sold as a bundle', 'learning_path.not_sold_as_bundle');
      priceSatuan = Number(path.price_bundle);
    } else {
      // langganan: belum ada catalog package terpisah — price dipasok klien,
      // divalidasi non-negatif by Zod. Tercatat di TIPE_HARGA_DARI_KLIEN;
      // menambah branch serupa di sini WAJIB menambah tipenya to sana.
      priceSatuan = item.price_unit ?? 0;
    }
    const quantity = item.quantity ?? 1;
    resolved.push({
      item_type: item.item_type,
      course_id: item.course_id ?? null,
      learning_path_id: item.learning_path_id ?? null,
      bundle_group_id: item.bundle_group_id ?? null,
      price_unit: priceSatuan,
      quantity,
      subtotal: round2(priceSatuan * quantity),
      meta: item.meta ?? null,
    });
  }
  return resolved;
}

async function applyCoupon(kode: string | undefined, subtotal: number): Promise<{ coupon_id: string | null; discount: number }> {
  if (!kode) return { coupon_id: null, discount: 0 };
  const coupon = await repo.couponByKode(kode);
  if (!coupon || !coupon.is_active) throw AppError.badRequest('This coupon is not valid', 'coupon.invalid');
  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) throw AppError.badRequest('This coupon is not valid yet', 'coupon.not_yet_valid');
  if (coupon.valid_until && new Date(coupon.valid_until) < now) throw AppError.badRequest('This coupon has expired', 'coupon.expired');
  if (coupon.max_quota != null && coupon.used_quota >= coupon.max_quota) {
    throw AppError.badRequest('This coupon has been fully redeemed', 'coupon.quota_exhausted');
  }
  if (coupon.min_purchase != null && subtotal < Number(coupon.min_purchase)) {
    throw AppError.badRequest('Your subtotal is below the minimum for this coupon', 'coupon.below_minimum');
  }
  const discount =
    coupon.discount_type === 'persen'
      ? round2((subtotal * Number(coupon.discount_value)) / 100)
      : Math.min(round2(Number(coupon.discount_value)), subtotal);
  return { coupon_id: coupon.id, discount };
}

async function buildOrder(
  tx: PoolClient,
  params: {
    buyer_user_id: string;
    channel: 'online' | 'manual';
    marketing_user_id: string | null;
    items: OrderItemInput[];
    coupon_kode?: string;
    notes?: string;
  },
): Promise<OrderRow> {
  const resolvedItems = await resolveItems(params.items);
  const subtotal = round2(resolvedItems.reduce((s, i) => s + i.subtotal, 0));
  const { coupon_id, discount } = await applyCoupon(params.coupon_kode, subtotal);
  const total = Math.max(0, round2(subtotal - discount));

  const checkout_expired_at =
    params.channel === 'online' ? new Date(Date.now() + DEFAULT_CHECKOUT_TIMEOUT_MINUTES * 60 * 1000) : null;

  const order = await repo.insertOrder(
    {
      buyer_user_id: params.buyer_user_id,
      channel: params.channel,
      marketing_user_id: params.marketing_user_id,
      coupon_id,
      subtotal,
      discount,
      total,
      checkout_expired_at,
      notes: params.notes ?? null,
    },
    tx,
  );

  for (const item of resolvedItems) {
    await repo.insertOrderItem({ order_id: order.id, ...item }, tx);
  }
  if (coupon_id) await repo.incrementCouponUsage(coupon_id, tx);

  return order;
}

/**
 * Boleh langsung diberi akses tanpa payment?
 *
 * Dua keadaan sah membuat sebuah order bernilai nol: course yang memang
 * dipasang gratis, dan kupon yang memotong habis seluruh invoice. Keduanya
 * dijanjikan Buku 3 dan keduanya previous buntu — `pay-gateway` menolak
 * dengan `order.free_no_payment`, `pay` menuntut amount positif, dan
 * `recomputeOrderStatus` hanya melunasi bila `total > 0`. Akibatnya course
 * gratis no bisa didaftari sama sekali.
 *
 * Syaratnya sengaja DUA, bukan sekadar `total === 0`:
 *
 *  1. totalnya benar-benar nol, dan
 *  2. seluruh price di order itu diturunkan server from catalog.
 *
 * Syarat kedua yang menahan penyalahgunaan. price `course`/`bundle`/`path`
 * read from basis data dan input klien diabaikan, jadi pembeli no bisa
 * memaksa nol. Tetapi `langganan` pricenya dipasok request — tanpa syarat kedua,
 * satu baris langganan berprice 0 cukup untuk mencetak order berstatus lunas
 * on kemauan pembeli sendiri.
 */
function bolehLangsungAktif(order: OrderRow, items: OrderItemInput[]): boolean {
  return Number(order.total) === 0 && priceSepenuhnyaDariKatalog(items);
}

// ── Checkout online (student) ──────────────────────────────────

export async function checkout(actor: AuthContext, input: CheckoutInput) {
  // Order bernilai nol diaktifkan di transaction yang sama dengan pembuatannya,
  // supaya no pernah ada keadaan antara "order gratis created" dan "aksesnya
  // diberikan" yang bisa failed di tengah jalan.
  const order = await withTransaction(async (tx) => {
    const o = await buildOrder(tx, {
      buyer_user_id: actor.userId,
      channel: 'online',
      marketing_user_id: null,
      items: input.items,
      coupon_kode: input.coupon_kode,
      notes: input.notes,
    });

    if (bolehLangsungAktif(o, input.items)) {
      await activateOrderOnLunas(tx, o, actor.userId);
      await recordAudit(
        {
          userId: actor.userId,
          module: 'transaction',
          action: 'checkout_gratis',
          entity: 'orders',
          entityId: o.id,
          after: {
            total: 0,
            // Dua sebab sah sebuah order bernilai nol; dicatat supaya report
            // bisa memisahkan course gratis from kupon potong-habis.
            sebab: Number(o.subtotal) > 0 ? 'kupon_100_persen' : 'kursus_gratis',
          },
        },
        tx,
      );
    }
    return o;
  });

  await recordAudit({
    userId: actor.userId,
    module: 'transaction',
    action: 'checkout',
    entity: 'orders',
    entityId: order.id,
    after: { total: order.total, channel: order.channel },
  });
  return detail(actor, order.id);
}

// ── Input tanda jadi manual (marketing/admin) ────────────────

export async function createManual(actor: AuthContext, input: ManualOrderInput) {
  if (!isMarketing(actor) && !isAdminLike(actor)) {
    throw AppError.forbidden('Only Marketing or an Admin can create a manual order', 'order.manual_requires_marketing');
  }
  // attribution commission — pelaku marketing yang menginput, kecuali admin menunjuk agen lain eksplisit
  const marketing_user_id = input.marketing_user_id ?? (isMarketing(actor) ? actor.userId : null);

  const order = await withTransaction((tx) =>
    buildOrder(tx, {
      buyer_user_id: input.buyer_user_id,
      channel: 'manual',
      marketing_user_id,
      items: input.items,
      coupon_kode: input.coupon_kode,
      notes: input.notes ?? 'Tanda jadi/invoice manual',
    }),
  );
  await recordAudit({
    userId: actor.userId,
    module: 'transaction',
    action: 'create_manual',
    entity: 'orders',
    entityId: order.id,
    after: { total: order.total, marketing_user_id },
  });
  return detail(actor, order.id);
}

// ── List & detail ─────────────────────────────────────────────

export async function list(actor: AuthContext, p: PageParams, filters: repo.Filters) {
  const scoped = { ...filters };
  if (!isAdminLike(actor)) {
    if (isMarketing(actor)) scoped.marketing_user_id = actor.userId;
    else scoped.buyer_user_id = actor.userId;
  }
  const { rows, total } = await repo.list(p, scoped);
  return { rows, total };
}

async function loadOrderScoped(actor: AuthContext, id: string): Promise<OrderRow> {
  const order = await repo.findById(id);
  if (!order) throw AppError.notFound('Order not found', 'order.not_found');
  const owns = order.buyer_user_id === actor.userId || order.marketing_user_id === actor.userId;
  if (!isAdminLike(actor) && !owns) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return order;
}

export async function detail(actor: AuthContext, id: string) {
  const order = await loadOrderScoped(actor, id);
  const items = await repo.itemsByOrder(order.id);
  const payments = await repo.paymentsByOrder(order.id);
  const invoice = await repo.invoiceByOrder(order.id);
  return { ...order, items, payments, invoice };
}

// ── Pelunasan → enrollment + revenue share + commission (finansial) ──

async function activateOrderOnLunas(tx: PoolClient, order: OrderRow, actorId: string | null): Promise<void> {
  await repo.updateOrderStatus(order.id, 'paid_in_full', tx);

  const items = await repo.itemsByOrder(order.id, tx);
  const ratio = Number(order.subtotal) > 0 ? Number(order.total) / Number(order.subtotal) : 1;
  const period = periodeNow();

  for (const item of items) {
    if (item.item_type === 'course' || item.item_type === 'bundle') {
      if (!item.course_id) continue;
      const course = await repo.courseById(item.course_id, tx);
      if (!course) continue;

      // revenue share instructor:lembaga from price efektif (setelah kupon)
      const efektif = round2(Number(item.subtotal) * ratio);
      const instructorProfile = await repo.instructorProfileById(course.instructor_id, tx);
      const persen = instructorProfile?.revenue_share_percent != null
        ? Number(instructorProfile.revenue_share_percent)
        : DEFAULT_INSTRUCTOR_SHARE_PERCENT;
      const amountInstruktur = round2((efektif * persen) / 100);
      const amountPlatform = round2(efektif - amountInstruktur);

      await repo.insertRevenueShare(
        {
          course_id: course.id,
          instructor_id: course.instructor_id,
          order_item_id: item.id,
          share_percentage: persen,
          amount_share: amountInstruktur,
          amount_platform: amountPlatform,
          period,
        },
        tx,
      );

      await repo.insertEnrollment({ user_id: order.buyer_user_id, course_id: item.course_id, source: 'buy', order_item_id: item.id }, tx);
    } else if (item.item_type === 'path' && item.learning_path_id) {
      const courseIds = await repo.pathCourseIds(item.learning_path_id, tx);
      for (const courseId of courseIds) {
        await repo.insertEnrollment({ user_id: order.buyer_user_id, course_id: courseId, source: 'path', order_item_id: item.id }, tx);
      }
      // Catatan: bagi hasil per-course pada channel ini diagregasi lintas
      // instructor by modul report, bukan di sini — view domain 05/09.
    }
    // item_type='subscription': aktivasi subscriptions/memberships di luar cakupan modul orders/marketing ini.
  }

  await repo.updateOrderStatus(order.id, 'access_active', tx);

  // engine commission marketing — attribution via orders.marketing_user_id
  await marketingService.computeCommissionOnOrderLunas(tx, order);

  await recordAudit(
    {
      userId: actorId,
      module: 'payment',
      action: 'order_lunas',
      entity: 'orders',
      entityId: order.id,
      before: { status: order.status },
      after: { status: 'access_active' },
    },
    tx,
  );
}

async function recomputeOrderStatus(tx: PoolClient, orderId: string, actorId: string | null): Promise<void> {
  const order = await repo.lockOrderForUpdate(orderId, tx);
  if (!order || order.status === 'paid_in_full' || order.status === 'access_active' || order.status === 'cancelled') return;

  const paid = await repo.sumVerifiedPayments(orderId, tx);
  const total = Number(order.total);
  if (paid >= total && total > 0) {
    await activateOrderOnLunas(tx, order, actorId);
  } else if (paid > 0) {
    await repo.updateOrderStatus(orderId, 'installment_running', tx);
  }
}

// ── Payment luar-jaringan: transfer bank / tunai (finansial) ──

export async function pay(actor: AuthContext, orderId: string, input: PayInput) {
  const order = await loadOrderScoped(actor, orderId);
  if (order.status === 'paid_in_full' || order.status === 'access_active') throw AppError.conflict('This order is already paid', 'order.already_paid');
  if (order.status === 'cancelled') throw AppError.conflict('This order has been cancelled', 'order.cancelled');

  // Metode gateway no boleh lewat sini: pencatatnya adalah pembeli, dan no
  // ada apa pun di request ini yang membuktikan uang sudah berpindah.
  if (!METODE_OFFLINE.has(input.method)) {
    throw AppError.badRequest(
      'That payment method must go through the payment gateway',
      'payment.method_requires_gateway',
    );
  }

  const result = await withTransaction(async (tx) => {
    const payment = await repo.insertPayment(
      {
        order_id: orderId,
        type: input.type,
        amount: input.amount,
        method: input.method,
        // Selalu menunggu manusia. Order menjadi lunas hanya lewat POST
        // /orders/:id/verify (transfer/tunai) atau webhook gateway.
        status: 'awaiting_verification',
        proof_media_id: input.proof_media_id ?? null,
        gateway_reference: input.gateway_reference ?? null,
        verified_by: null,
        verified_at: null,
        notes_verifikasi: null,
      },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'payment',
        action: 'pay',
        entity: 'payments',
        entityId: payment.id,
        after: { type: payment.type, amount: payment.amount, status: payment.status },
      },
      tx,
    );
    return payment;
  });

  return { payment: result, order: await detail(actor, orderId) };
}

// ── Payment via gateway (finansial) ─────────────────────
//
// Delapan gateway didukung (Stripe, PayPal, Razorpay, Paystack, Flutterwave,
// Mollie, Midtrans, Easebuzz). Adapter-nya ada di `core/payment/providers`; modul ini
// hanya memutuskan kapan sebuah order menjadi lunas. Order HANYA lunas lewat
// webhook — redirect balik from browser no pernah dianggap proof bayar.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mata uang toko (`settings.currency.code`), fallback IDR. */
async function storeCurrency(): Promise<string> {
  const code = await getSetting('currency.code', 'IDR');
  return (code || 'IDR').toUpperCase();
}

/** Konfigurasi payment untuk FE: gateway yang active + account transfer manual. */
export async function paymentConfig() {
  // Kredensial gateway kini datang from settings (env hanya cadangan), jadi
  // cache-nya harus terisi sebelum register gateway dibangun.
  await ensurePaymentSettings();

  const currency = await storeCurrency();
  const providers = availableProviders(currency);

  // Rekening tujuan adalah master data (`bank_accounts`); di layar settings
  // transfer manual hanya punya sakelar active/no, bukan kolom kredensial.
  const manualAktif = manualTransferEnabled();
  const account = manualAktif ? await listActiveBankAccounts() : [];
  const primary = account.find((r) => r.is_primary) ?? account[0] ?? null;

  const midtrans = providers.find((p) => p.id === 'midtrans');

  return {
    currency,
    /** Gateway siap pakai, sort_order sesuai tampilan checkout. */
    providers: providers.map((p) => ({
      id: p.id,
      label: p.label,
      config: p.publicConfig(),
    })),
    /** Transfer bank manual active? Rekeningnya diatur di menu Rekening Bank. */
    manual_transfer_enabled: manualAktif,
    /** Seluruh account active — FE menampilkan pilihan bila lebih from satu. */
    bank_accounts: account.map((r) => ({
      id: r.id,
      bank: r.bank_name,
      account_number: r.account_number,
      account_name: r.account_name,
      branch: r.branch,
      is_primary: r.is_primary,
    })),

    // ── Kompatibilitas klien lama (hanya tahu Midtrans) ──
    provider: midtrans ? 'midtrans' : (providers[0]?.id ?? null),
    midtrans: {
      configured: !!midtrans,
      client_key: env.MIDTRANS_CLIENT_KEY ?? null,
      is_production: env.MIDTRANS_IS_PRODUCTION,
    },
    configured: providers.length > 0,
    client_key: env.MIDTRANS_CLIENT_KEY ?? null,
    is_production: env.MIDTRANS_IS_PRODUCTION,
    bank_transfer: primary
      ? { bank: primary.bank_name, account_number: primary.account_number, account_name: primary.account_name }
      : null,
  };
}

/**
 * start payment gateway: buat payment pending, lalu sesi checkout di provider.
 * `payments.id` dikirim sebagai referensi sehingga webhook bisa menemukannya lagi.
 *
 * Bila belum ada gateway terkonfigurasi, checkout DITOLAK. Dulu channel itu
 * melunasi order begitu saja "supaya alur bisa diuji" — dan karena seluruh
 * kredensial gateway bersifat opsional, itulah keadaan setiap instalasi baru:
 * toko yang baru dipasang membagikan course berbayar secara cuma-cuma until
 * pemiliknya memasang gateway. Auto-settle kini harus dinyalakan sendiri lewat
 * `PAYMENT_DEV_AUTOSETTLE=true` dan no bisa hidup di `NODE_ENV=production`.
 */
export async function payGateway(actor: AuthContext, orderId: string, providerId?: string) {
  const order = await loadOrderScoped(actor, orderId);
  if (order.status === 'paid_in_full' || order.status === 'access_active') throw AppError.conflict('This order is already paid', 'order.already_paid');
  if (order.status === 'cancelled') throw AppError.conflict('This order has been cancelled', 'order.cancelled');
  const total = Number(order.total);
  if (total <= 0) throw AppError.badRequest('This order is free and needs no payment', 'order.free_no_payment');

  await ensurePaymentSettings();
  const currency = await storeCurrency();
  const ready = availableProviders(currency);

  // Klien lama memanggil tanpa `provider`; pakai yang pertama tersedia.
  let provider: PaymentProvider | null = null;
  if (providerId) {
    provider = getProvider(providerId);
    if (!provider) throw AppError.badRequest(`Unknown payment gateway '${providerId}'`, 'payment.gateway_unknown');
    if (!provider.isConfigured()) throw AppError.badRequest(`Payment gateway '${providerId}' is not configured`, 'payment.gateway_not_configured');
    if (!ready.some((p) => p.id === provider!.id)) {
      throw AppError.badRequest(`Payment gateway '${providerId}' does not support ${currency}`, 'payment.gateway_currency_unsupported');
    }
  } else {
    provider = ready[0] ?? null;
  }

  // Tanpa gateway no ada cara memastikan uang login. Menolak lebih awal juga
  // menghindari baris payment menggantung untuk checkout yang mustahil finish.
  if (!provider) {
    if (!env.PAYMENT_DEV_AUTOSETTLE || isProd) {
      throw AppError.badRequest(
        'No payment gateway is configured yet — pay by manual bank transfer, or ask the store admin to enable a gateway',
        'payment.no_gateway_configured',
      );
    }
    logger.warn(
      { orderId },
      'PAYMENT_DEV_AUTOSETTLE: order settled without a gateway — development only',
    );
  }

  const method = provider?.id ?? 'dev_autosettle';

  const payment = await withTransaction(async (tx) => {
    const p = await repo.insertPayment(
      {
        order_id: orderId,
        type: 'full',
        amount: total,
        method,
        status: 'awaiting_verification',
        proof_media_id: null,
        gateway_reference: null,
        verified_by: null,
        verified_at: null,
        notes_verifikasi: null,
      },
      tx,
    );
    await recordAudit(
      { userId: actor.userId, module: 'payment', action: 'gateway_init', entity: 'payments', entityId: p.id, after: { method, amount: total } },
      tx,
    );
    return p;
  });

  // Auto-settle pengembangan (sudah dijamin non-produksi + opt-in di on).
  if (!provider) {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        { status: 'verified', verified_by: actor.userId, verified_at: new Date(), notes_verifikasi: 'PAYMENT_DEV_AUTOSETTLE (development, no gateway)' },
        tx,
      );
      await recomputeOrderStatus(tx, orderId, actor.userId);
    });
    return { payment_id: payment.id, provider: null, redirect_url: null, snap: null, dev_auto_settled: true, order: await detail(actor, orderId) };
  }

  // Kontak pembeli untuk customer_details
  const buyer = await query<{ name_lengkap: string; email: string | null; number_wa: string | null }>(
    `SELECT name_lengkap, email, number_wa FROM users WHERE id = $1`,
    [order.buyer_user_id],
  );
  const c = buyer[0];

  const checkout = await provider.createCheckout({
    paymentId: payment.id,
    amount: total,
    currency,
    description: `Order ${orderId}`,
    customer: {
      name: c?.name_lengkap ?? undefined,
      email: c?.email ?? undefined,
      phone: c?.number_wa ?? undefined,
    },
    returnUrl: `${env.PAYMENT_RETURN_URL}?order=${orderId}`,
    cancelUrl: `${env.PAYMENT_CANCEL_URL}?order=${orderId}`,
    notifyUrl: `${env.APP_URL}/api/v1/orders/webhook/${provider.id}`,
  });

  await query(`UPDATE payments SET gateway_reference = $2 WHERE id = $1`, [
    payment.id,
    checkout.gatewayRef ?? payment.id,
  ]);

  return {
    payment_id: payment.id,
    provider: provider.id,
    redirect_url: checkout.redirectUrl,
    meta: checkout.meta ?? null,
    // Bentuk lama: klien Midtrans yang belum diperbarui masih membaca `snap.token`.
    snap: checkout.meta?.snap_token
      ? { token: checkout.meta.snap_token as string, redirect_url: checkout.redirectUrl }
      : null,
    order: await detail(actor, orderId),
  };
}

/**
 * Handler webhook gateway (dipanggil TANPA auth — diverifikasi by adapter).
 * Idempoten: payment yang sudah terverifikasi diabaikan.
 */
export async function handleGatewayWebhook(providerId: string, req: WebhookRequest) {
  await ensurePaymentSettings();
  const provider = getProvider(providerId);
  if (!provider) throw AppError.notFound(`Unknown payment gateway '${providerId}'`, 'payment.gateway_unknown');
  if (!provider.isConfigured()) throw AppError.badRequest(`Payment gateway '${providerId}' is not configured`, 'payment.gateway_not_configured');

  let event;
  try {
    event = await provider.handleWebhook(req);
  } catch (err) {
    // Verifikasi failed = bukan from gateway. Jangan bocorkan detailnya.
    logger.warn({ provider: providerId, err }, 'Gateway webhook verification failed');
    throw AppError.forbidden('Invalid webhook signature', 'payment.invalid_webhook_signature');
  }

  if (!event) return { ok: true, note: 'irrelevant event — ignored' };

  const payment = event.referenceIsGateway
    ? await repo.paymentByGatewayRef(event.reference)
    : UUID_RE.test(event.reference)
      ? await repo.paymentById(event.reference)
      : await repo.paymentByGatewayRef(event.reference);

  if (!payment) return { ok: true, note: 'payment not found — ignored' };

  // Gateway lain no boleh menyelesaikan payment milik gateway ini.
  if (payment.method !== provider.id) {
    logger.warn(
      { provider: provider.id, payment: payment.id, method: payment.method },
      'Webhook refers to a payment belonging to another gateway — ignored',
    );
    return { ok: true, note: 'gateway mismatch — ignored' };
  }

  // idempotensi
  if (payment.status === 'verified') return { ok: true, note: 'already processed' };
  if (payment.status === 'rejected' && event.outcome !== 'settlement') return { ok: true, note: 'already rejected' };

  if (event.outcome === 'settlement') {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        {
          status: 'verified',
          verified_by: null,
          verified_at: new Date(),
          notes_verifikasi: event.note ?? provider.label,
        },
        tx,
      );
      await recomputeOrderStatus(tx, payment.order_id, null);
      await recordAudit(
        { userId: null, module: 'payment', action: 'gateway_settlement', entity: 'payments', entityId: payment.id, after: { provider: provider.id, note: event.note } },
        tx,
      );
    });
  } else if (event.outcome === 'failed') {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        { status: 'rejected', verified_by: null, verified_at: new Date(), notes_verifikasi: event.note ?? provider.label },
        tx,
      );
      await recordAudit(
        { userId: null, module: 'payment', action: 'gateway_failed', entity: 'payments', entityId: payment.id, after: { provider: provider.id, note: event.note } },
        tx,
      );
    });
  }
  // pending / challenge: biarkan menunggu

  return { ok: true, outcome: event.outcome };
}

// ── Verifikasi payment manual (admin_ops) (finansial) ──

export async function verify(actor: AuthContext, orderId: string, input: VerifyPaymentInput) {
  const order = await repo.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'order.not_found');
  // `payment_id` opsional: layar Transaction menyetujui sebuah order, bukan sebuah
  // baris payment, dan hampir semua order hanya punya satu klaim yang
  // menunggu. Bila ternyata ada lebih from satu, minta penyebutnya secara
  // eksplisit alih-alih menebak yang mana.
  let payment;
  if (input.payment_id) {
    payment = await repo.paymentById(input.payment_id);
    if (!payment || payment.order_id !== orderId) throw AppError.notFound('Payment not found', 'payment.not_found');
    if (payment.status !== 'awaiting_verification') throw AppError.conflict('This payment has already been verified or rejected', 'payment.already_decided');
  } else {
    const pending = (await repo.paymentsByOrder(orderId)).filter((p) => p.status === 'awaiting_verification');
    if (!pending.length) throw AppError.notFound('This order has no payment waiting for verification', 'payment.none_pending');
    if (pending.length > 1) {
      throw AppError.badRequest('This order has several payments waiting — say which one', 'payment.ambiguous_pending', {
        payment_ids: pending.map((p) => p.id),
      });
    }
    payment = pending[0];
  }

  const newStatus = input.action === 'verify' ? 'verified' : 'rejected';

  await withTransaction(async (tx) => {
    await repo.updatePaymentVerification(
      payment.id,
      { status: newStatus, verified_by: actor.userId, verified_at: new Date(), notes_verifikasi: input.notes_verifikasi ?? null },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'payment',
        action: `verify_${input.action}`,
        entity: 'payments',
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: newStatus },
        reason: input.notes_verifikasi ?? null,
      },
      tx,
    );
    if (newStatus === 'verified') await recomputeOrderStatus(tx, orderId, actor.userId);
  });

  return detail(actor, orderId);
}

// ── Invoice ───────────────────────────────────────────────────

export async function invoice(actor: AuthContext, orderId: string) {
  await loadOrderScoped(actor, orderId);
  const existing = await repo.invoiceByOrder(orderId);
  if (existing) return existing;

  const now = new Date();
  const seq = (await repo.countInvoicesInPeriod(now.getUTCFullYear(), now.getUTCMonth() + 1)) + 1;
  const number_invoice = `INV/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(seq).padStart(5, '0')}`;
  return repo.insertInvoice({ order_id: orderId, number_invoice });
}

// ── Refund (finansial — approval Direktur wajib) ──────────

export async function refund(actor: AuthContext, orderId: string, input: RefundInput) {
  if (!isDirektur(actor)) throw AppError.forbidden('Only a Director can approve a refund', 'refund.approve_requires_director');
  const order = await repo.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'order.not_found');
  if (!['paid_in_full', 'access_active'].includes(order.status)) {
    throw AppError.conflict('Only a paid order with active access can be refunded', 'refund.order_not_eligible');
  }
  if (input.amount > Number(order.total)) throw AppError.badRequest('The refund amount is larger than the order total', 'refund.exceeds_order_total');

  const result = await withTransaction(async (tx) => {
    const now = new Date();
    // Direktur menyetujui & mengeksekusi dalam satu langkah (alur disederhanakan sesuai cakupan modul ini).
    const refundRow = await repo.insertRefund(
      {
        order_id: orderId,
        amount: input.amount,
        reason: input.reason,
        status: 'completed',
        submitted_by: actor.userId,
        approved_by: actor.userId,
        approved_at: now,
        processed_at: now,
        method_pengembalian: input.method_pengembalian ?? null,
        notes: input.notes ?? null,
      },
      tx,
    );

    await repo.updateOrderStatus(orderId, 'cancelled', tx);
    // pembalikan revenue share (soft-delete — enum revenue_shares.status no menyediakan status reversal)
    await repo.softDeleteRevenueSharesByOrder(orderId, tx);
    await repo.cancelEnrollmentsByOrder(orderId, tx);
    await marketingService.reverseCommissionOnRefund(tx, orderId, input.reason);

    await recordAudit(
      {
        userId: actor.userId,
        module: 'refund',
        action: 'refund_execute',
        entity: 'refunds',
        entityId: refundRow.id,
        before: { status: order.status },
        after: { status: 'cancelled', amount: input.amount },
        reason: input.reason,
      },
      tx,
    );
    return refundRow;
  });

  return { refund: result, order: await detail(actor, orderId) };
}
