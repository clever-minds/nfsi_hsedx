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

// Finansial: fallback revenue share instruktur (README §"revenue share 60:40") bila
// `instructor_profiles.revenue_share_percent` (override) tidak diisi. Final via `settings` (domain 12).
const DEFAULT_INSTRUCTOR_SHARE_PERCENT = 60;
// Timeout checkout default (menit) — placeholder sampai `settings.checkout_timeout_minutes` tersedia (domain 12).
const DEFAULT_CHECKOUT_TIMEOUT_MINUTES = 24 * 60;

const round2 = (n: number) => Math.round(n * 100) / 100;

const isAdminLike = (actor: AuthContext) =>
  actor.roles.includes('super_admin') || actor.roles.includes('direktur') || actor.roles.includes('admin_ops');
const isMarketing = (actor: AuthContext) => actor.roles.includes('marketing');
const isDirektur = (actor: AuthContext) => actor.roles.includes('super_admin') || actor.roles.includes('direktur');

/**
 * Metode luar-jaringan yang boleh dicatat lewat `POST /orders/:id/pay`.
 *
 * Endpoint itu hanya MENCATAT klaim pembayaran; tidak ada uang yang berpindah
 * di dalamnya. Karena itu setiap catatan masuk sebagai `menunggu_verifikasi`
 * dan baru melunasi order setelah seseorang ber-izin `pembayaran.update`
 * menyetujuinya di layar Transaksi.
 *
 * Metode gateway (kartu, VA, e-wallet, QRIS) sengaja TIDAK ada di daftar ini.
 * Untuk metode tersebut satu-satunya bukti uang sudah masuk adalah webhook
 * provider yang tertandatangani, dan jalurnya `POST /orders/:id/pay-gateway`.
 * Sebelumnya keempatnya diterima di sini dan langsung ditandai terverifikasi
 * sebagai "simulasi gateway" — artinya siapa pun yang boleh membuat order bisa
 * melunasinya sendiri tanpa membayar.
 */
const METODE_OFFLINE = new Set(['transfer_bank', 'tunai', 'lainnya']);

function periodeNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Penyusunan item & kupon ──────────────────────────────────

/**
 * Tipe item yang harganya DIPASOK KLIEN, bukan diturunkan dari katalog.
 *
 * Untuk `kursus`, `bundle` dan `path`, `resolveItems()` membaca harga dari basis
 * data dan mengabaikan apa pun yang dikirim pembeli. `langganan` belum punya
 * katalog paket tersendiri, jadi harganya datang dari request.
 *
 * Himpunan ini ada supaya keputusan "total nol boleh dipercaya" (lihat
 * `checkout()`) tidak pernah lepas sinkron dari kenyataan di `resolveItems()`.
 * Tanpa itu, satu baris langganan berharga 0 cukup untuk mencetak order lunas
 * sendiri. Dijaga `tests/unit/security-guards.test.ts`.
 */
export const TIPE_HARGA_DARI_KLIEN = new Set<OrderItemInput['item_tipe']>(['langganan']);

/** Seluruh harga order ini diturunkan server dari katalog? */
export const hargaSepenuhnyaDariKatalog = (items: OrderItemInput[]): boolean =>
  items.every((i) => !TIPE_HARGA_DARI_KLIEN.has(i.item_tipe));

interface ResolvedItem {
  item_tipe: OrderItemInput['item_tipe'];
  course_id: string | null;
  learning_path_id: string | null;
  bundle_group_id: string | null;
  harga_satuan: number;
  kuantitas: number;
  subtotal: number;
  meta: unknown;
}

async function resolveItems(items: OrderItemInput[]): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  for (const item of items) {
    let hargaSatuan = 0;
    if (item.item_tipe === 'kursus' || item.item_tipe === 'bundle') {
      const course = await repo.courseById(item.course_id!);
      if (!course) throw AppError.badRequest(`Course ${item.course_id} was not found`, 'course.not_found');
      hargaSatuan = Number(course.harga);
    } else if (item.item_tipe === 'path') {
      const path = await repo.learningPathById(item.learning_path_id!);
      if (!path) throw AppError.badRequest(`Learning path ${item.learning_path_id} was not found`, 'learning_path.not_found');
      if (path.harga_bundle == null) throw AppError.badRequest('This learning path is not sold as a bundle', 'learning_path.not_sold_as_bundle');
      hargaSatuan = Number(path.harga_bundle);
    } else {
      // langganan: belum ada katalog paket terpisah — harga dipasok klien,
      // divalidasi non-negatif oleh Zod. Tercatat di TIPE_HARGA_DARI_KLIEN;
      // menambah cabang serupa di sini WAJIB menambah tipenya ke sana.
      hargaSatuan = item.harga_satuan ?? 0;
    }
    const kuantitas = item.kuantitas ?? 1;
    resolved.push({
      item_tipe: item.item_tipe,
      course_id: item.course_id ?? null,
      learning_path_id: item.learning_path_id ?? null,
      bundle_group_id: item.bundle_group_id ?? null,
      harga_satuan: hargaSatuan,
      kuantitas,
      subtotal: round2(hargaSatuan * kuantitas),
      meta: item.meta ?? null,
    });
  }
  return resolved;
}

async function applyCoupon(kode: string | undefined, subtotal: number): Promise<{ coupon_id: string | null; diskon: number }> {
  if (!kode) return { coupon_id: null, diskon: 0 };
  const coupon = await repo.couponByKode(kode);
  if (!coupon || !coupon.is_aktif) throw AppError.badRequest('This coupon is not valid', 'coupon.invalid');
  const now = new Date();
  if (coupon.berlaku_mulai && new Date(coupon.berlaku_mulai) > now) throw AppError.badRequest('This coupon is not valid yet', 'coupon.not_yet_valid');
  if (coupon.berlaku_sampai && new Date(coupon.berlaku_sampai) < now) throw AppError.badRequest('This coupon has expired', 'coupon.expired');
  if (coupon.kuota_maksimal != null && coupon.kuota_terpakai >= coupon.kuota_maksimal) {
    throw AppError.badRequest('This coupon has been fully redeemed', 'coupon.quota_exhausted');
  }
  if (coupon.minimum_pembelian != null && subtotal < Number(coupon.minimum_pembelian)) {
    throw AppError.badRequest('Your subtotal is below the minimum for this coupon', 'coupon.below_minimum');
  }
  const diskon =
    coupon.tipe_potongan === 'persen'
      ? round2((subtotal * Number(coupon.nilai_potongan)) / 100)
      : Math.min(round2(Number(coupon.nilai_potongan)), subtotal);
  return { coupon_id: coupon.id, diskon };
}

async function buildOrder(
  tx: PoolClient,
  params: {
    buyer_user_id: string;
    jalur: 'online' | 'manual';
    marketing_user_id: string | null;
    items: OrderItemInput[];
    coupon_kode?: string;
    catatan?: string;
  },
): Promise<OrderRow> {
  const resolvedItems = await resolveItems(params.items);
  const subtotal = round2(resolvedItems.reduce((s, i) => s + i.subtotal, 0));
  const { coupon_id, diskon } = await applyCoupon(params.coupon_kode, subtotal);
  const total = Math.max(0, round2(subtotal - diskon));

  const checkout_kedaluwarsa_at =
    params.jalur === 'online' ? new Date(Date.now() + DEFAULT_CHECKOUT_TIMEOUT_MINUTES * 60 * 1000) : null;

  const order = await repo.insertOrder(
    {
      buyer_user_id: params.buyer_user_id,
      jalur: params.jalur,
      marketing_user_id: params.marketing_user_id,
      coupon_id,
      subtotal,
      diskon,
      total,
      checkout_kedaluwarsa_at,
      catatan: params.catatan ?? null,
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
 * Boleh langsung diberi akses tanpa pembayaran?
 *
 * Dua keadaan sah membuat sebuah order bernilai nol: kursus yang memang
 * dipasang gratis, dan kupon yang memotong habis seluruh tagihan. Keduanya
 * dijanjikan Buku 3 dan keduanya sebelumnya buntu — `pay-gateway` menolak
 * dengan `order.free_no_payment`, `pay` menuntut nominal positif, dan
 * `recomputeOrderStatus` hanya melunasi bila `total > 0`. Akibatnya kursus
 * gratis tidak bisa didaftari sama sekali.
 *
 * Syaratnya sengaja DUA, bukan sekadar `total === 0`:
 *
 *  1. totalnya benar-benar nol, dan
 *  2. seluruh harga di order itu diturunkan server dari katalog.
 *
 * Syarat kedua yang menahan penyalahgunaan. Harga `kursus`/`bundle`/`path`
 * dibaca dari basis data dan input klien diabaikan, jadi pembeli tidak bisa
 * memaksa nol. Tetapi `langganan` harganya dipasok request — tanpa syarat kedua,
 * satu baris langganan berharga 0 cukup untuk mencetak order berstatus lunas
 * atas kemauan pembeli sendiri.
 */
function bolehLangsungAktif(order: OrderRow, items: OrderItemInput[]): boolean {
  return Number(order.total) === 0 && hargaSepenuhnyaDariKatalog(items);
}

// ── Checkout online (siswa) ──────────────────────────────────

export async function checkout(actor: AuthContext, input: CheckoutInput) {
  // Order bernilai nol diaktifkan di transaksi yang sama dengan pembuatannya,
  // supaya tidak pernah ada keadaan antara "order gratis dibuat" dan "aksesnya
  // diberikan" yang bisa gagal di tengah jalan.
  const order = await withTransaction(async (tx) => {
    const o = await buildOrder(tx, {
      buyer_user_id: actor.userId,
      jalur: 'online',
      marketing_user_id: null,
      items: input.items,
      coupon_kode: input.coupon_kode,
      catatan: input.catatan,
    });

    if (bolehLangsungAktif(o, input.items)) {
      await activateOrderOnLunas(tx, o, actor.userId);
      await recordAudit(
        {
          userId: actor.userId,
          module: 'transaksi',
          action: 'checkout_gratis',
          entity: 'orders',
          entityId: o.id,
          after: {
            total: 0,
            // Dua sebab sah sebuah order bernilai nol; dicatat supaya laporan
            // bisa memisahkan kursus gratis dari kupon potong-habis.
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
    module: 'transaksi',
    action: 'checkout',
    entity: 'orders',
    entityId: order.id,
    after: { total: order.total, jalur: order.jalur },
  });
  return detail(actor, order.id);
}

// ── Input tanda jadi manual (marketing/admin) ────────────────

export async function createManual(actor: AuthContext, input: ManualOrderInput) {
  if (!isMarketing(actor) && !isAdminLike(actor)) {
    throw AppError.forbidden('Only Marketing or an Admin can create a manual order', 'order.manual_requires_marketing');
  }
  // attribution komisi — pelaku marketing yang menginput, kecuali admin menunjuk agen lain eksplisit
  const marketing_user_id = input.marketing_user_id ?? (isMarketing(actor) ? actor.userId : null);

  const order = await withTransaction((tx) =>
    buildOrder(tx, {
      buyer_user_id: input.buyer_user_id,
      jalur: 'manual',
      marketing_user_id,
      items: input.items,
      coupon_kode: input.coupon_kode,
      catatan: input.catatan ?? 'Tanda jadi/invoice manual',
    }),
  );
  await recordAudit({
    userId: actor.userId,
    module: 'transaksi',
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

// ── Pelunasan → enrollment + revenue share + komisi (finansial) ──

async function activateOrderOnLunas(tx: PoolClient, order: OrderRow, actorId: string | null): Promise<void> {
  await repo.updateOrderStatus(order.id, 'lunas', tx);

  const items = await repo.itemsByOrder(order.id, tx);
  const ratio = Number(order.subtotal) > 0 ? Number(order.total) / Number(order.subtotal) : 1;
  const periode = periodeNow();

  for (const item of items) {
    if (item.item_tipe === 'kursus' || item.item_tipe === 'bundle') {
      if (!item.course_id) continue;
      const course = await repo.courseById(item.course_id, tx);
      if (!course) continue;

      // revenue share instruktur:lembaga dari harga efektif (setelah kupon)
      const efektif = round2(Number(item.subtotal) * ratio);
      const instructorProfile = await repo.instructorProfileById(course.instructor_id, tx);
      const persen = instructorProfile?.revenue_share_percent != null
        ? Number(instructorProfile.revenue_share_percent)
        : DEFAULT_INSTRUCTOR_SHARE_PERCENT;
      const nominalInstruktur = round2((efektif * persen) / 100);
      const nominalPlatform = round2(efektif - nominalInstruktur);

      await repo.insertRevenueShare(
        {
          course_id: course.id,
          instructor_id: course.instructor_id,
          order_item_id: item.id,
          persen_share: persen,
          nominal_share: nominalInstruktur,
          nominal_platform: nominalPlatform,
          periode,
        },
        tx,
      );

      await repo.insertEnrollment({ user_id: order.buyer_user_id, course_id: item.course_id, sumber: 'beli', order_item_id: item.id }, tx);
    } else if (item.item_tipe === 'path' && item.learning_path_id) {
      const courseIds = await repo.pathCourseIds(item.learning_path_id, tx);
      for (const courseId of courseIds) {
        await repo.insertEnrollment({ user_id: order.buyer_user_id, course_id: courseId, sumber: 'path', order_item_id: item.id }, tx);
      }
      // Catatan: bagi hasil per-kursus pada jalur ini diagregasi lintas
      // instruktur oleh modul laporan, bukan di sini — lihat domain 05/09.
    }
    // item_tipe='langganan': aktivasi subscriptions/memberships di luar cakupan modul orders/marketing ini.
  }

  await repo.updateOrderStatus(order.id, 'akses_aktif', tx);

  // engine komisi marketing — attribution via orders.marketing_user_id
  await marketingService.computeCommissionOnOrderLunas(tx, order);

  await recordAudit(
    {
      userId: actorId,
      module: 'pembayaran',
      action: 'order_lunas',
      entity: 'orders',
      entityId: order.id,
      before: { status: order.status },
      after: { status: 'akses_aktif' },
    },
    tx,
  );
}

async function recomputeOrderStatus(tx: PoolClient, orderId: string, actorId: string | null): Promise<void> {
  const order = await repo.lockOrderForUpdate(orderId, tx);
  if (!order || order.status === 'lunas' || order.status === 'akses_aktif' || order.status === 'batal') return;

  const paid = await repo.sumVerifiedPayments(orderId, tx);
  const total = Number(order.total);
  if (paid >= total && total > 0) {
    await activateOrderOnLunas(tx, order, actorId);
  } else if (paid > 0) {
    await repo.updateOrderStatus(orderId, 'dp_cicilan_berjalan', tx);
  }
}

// ── Pembayaran luar-jaringan: transfer bank / tunai (finansial) ──

export async function pay(actor: AuthContext, orderId: string, input: PayInput) {
  const order = await loadOrderScoped(actor, orderId);
  if (order.status === 'lunas' || order.status === 'akses_aktif') throw AppError.conflict('This order is already paid', 'order.already_paid');
  if (order.status === 'batal') throw AppError.conflict('This order has been cancelled', 'order.cancelled');

  // Metode gateway tidak boleh lewat sini: pencatatnya adalah pembeli, dan tidak
  // ada apa pun di request ini yang membuktikan uang sudah berpindah.
  if (!METODE_OFFLINE.has(input.metode)) {
    throw AppError.badRequest(
      'That payment method must go through the payment gateway',
      'payment.method_requires_gateway',
    );
  }

  const result = await withTransaction(async (tx) => {
    const payment = await repo.insertPayment(
      {
        order_id: orderId,
        jenis: input.jenis,
        nominal: input.nominal,
        metode: input.metode,
        // Selalu menunggu manusia. Order menjadi lunas hanya lewat POST
        // /orders/:id/verify (transfer/tunai) atau webhook gateway.
        status: 'menunggu_verifikasi',
        bukti_media_id: input.bukti_media_id ?? null,
        referensi_gateway: input.referensi_gateway ?? null,
        verified_by: null,
        verified_at: null,
        catatan_verifikasi: null,
      },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'pembayaran',
        action: 'pay',
        entity: 'payments',
        entityId: payment.id,
        after: { jenis: payment.jenis, nominal: payment.nominal, status: payment.status },
      },
      tx,
    );
    return payment;
  });

  return { payment: result, order: await detail(actor, orderId) };
}

// ── Pembayaran via gateway (finansial) ─────────────────────
//
// Tujuh gateway didukung (Stripe, PayPal, Razorpay, Paystack, Flutterwave,
// Mollie, Midtrans). Adapter-nya ada di `core/payment/providers`; modul ini
// hanya memutuskan kapan sebuah order menjadi lunas. Order HANYA lunas lewat
// webhook — redirect balik dari browser tidak pernah dianggap bukti bayar.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mata uang toko (`settings.currency.code`), fallback IDR. */
async function storeCurrency(): Promise<string> {
  const code = await getSetting('currency.code', 'IDR');
  return (code || 'IDR').toUpperCase();
}

/** Konfigurasi pembayaran untuk FE: gateway yang aktif + rekening transfer manual. */
export async function paymentConfig() {
  // Kredensial gateway kini datang dari Pengaturan (env hanya cadangan), jadi
  // cache-nya harus terisi sebelum daftar gateway dibangun.
  await ensurePaymentSettings();

  const currency = await storeCurrency();
  const providers = availableProviders(currency);

  // Rekening tujuan adalah master data (`bank_accounts`); di layar Pengaturan
  // transfer manual hanya punya sakelar aktif/tidak, bukan kolom kredensial.
  const manualAktif = manualTransferEnabled();
  const rekening = manualAktif ? await listActiveBankAccounts() : [];
  const utama = rekening.find((r) => r.is_utama) ?? rekening[0] ?? null;

  const midtrans = providers.find((p) => p.id === 'midtrans');

  return {
    currency,
    /** Gateway siap pakai, urut sesuai tampilan checkout. */
    providers: providers.map((p) => ({
      id: p.id,
      label: p.label,
      config: p.publicConfig(),
    })),
    /** Transfer bank manual aktif? Rekeningnya diatur di menu Rekening Bank. */
    manual_transfer_enabled: manualAktif,
    /** Seluruh rekening aktif — FE menampilkan pilihan bila lebih dari satu. */
    bank_accounts: rekening.map((r) => ({
      id: r.id,
      bank: r.nama_bank,
      nomor_rekening: r.nomor_rekening,
      atas_nama: r.atas_nama,
      cabang: r.cabang,
      is_utama: r.is_utama,
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
    bank_transfer: utama
      ? { bank: utama.nama_bank, nomor_rekening: utama.nomor_rekening, atas_nama: utama.atas_nama }
      : null,
  };
}

/**
 * Mulai pembayaran gateway: buat payment pending, lalu sesi checkout di provider.
 * `payments.id` dikirim sebagai referensi sehingga webhook bisa menemukannya lagi.
 *
 * Bila belum ada gateway terkonfigurasi, checkout DITOLAK. Dulu jalur itu
 * melunasi order begitu saja "supaya alur bisa diuji" — dan karena seluruh
 * kredensial gateway bersifat opsional, itulah keadaan setiap instalasi baru:
 * toko yang baru dipasang membagikan kursus berbayar secara cuma-cuma sampai
 * pemiliknya memasang gateway. Auto-settle kini harus dinyalakan sendiri lewat
 * `PAYMENT_DEV_AUTOSETTLE=true` dan tidak bisa hidup di `NODE_ENV=production`.
 */
export async function payGateway(actor: AuthContext, orderId: string, providerId?: string) {
  const order = await loadOrderScoped(actor, orderId);
  if (order.status === 'lunas' || order.status === 'akses_aktif') throw AppError.conflict('This order is already paid', 'order.already_paid');
  if (order.status === 'batal') throw AppError.conflict('This order has been cancelled', 'order.cancelled');
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

  // Tanpa gateway tidak ada cara memastikan uang masuk. Menolak lebih awal juga
  // menghindari baris payment menggantung untuk checkout yang mustahil selesai.
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

  const metode = provider?.id ?? 'dev_autosettle';

  const payment = await withTransaction(async (tx) => {
    const p = await repo.insertPayment(
      {
        order_id: orderId,
        jenis: 'penuh',
        nominal: total,
        metode,
        status: 'menunggu_verifikasi',
        bukti_media_id: null,
        referensi_gateway: null,
        verified_by: null,
        verified_at: null,
        catatan_verifikasi: null,
      },
      tx,
    );
    await recordAudit(
      { userId: actor.userId, module: 'pembayaran', action: 'gateway_init', entity: 'payments', entityId: p.id, after: { metode, nominal: total } },
      tx,
    );
    return p;
  });

  // Auto-settle pengembangan (sudah dijamin non-produksi + opt-in di atas).
  if (!provider) {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        { status: 'terverifikasi', verified_by: actor.userId, verified_at: new Date(), catatan_verifikasi: 'PAYMENT_DEV_AUTOSETTLE (development, no gateway)' },
        tx,
      );
      await recomputeOrderStatus(tx, orderId, actor.userId);
    });
    return { payment_id: payment.id, provider: null, redirect_url: null, snap: null, dev_auto_settled: true, order: await detail(actor, orderId) };
  }

  // Kontak pembeli untuk customer_details
  const buyer = await query<{ nama_lengkap: string; email: string | null; nomor_wa: string | null }>(
    `SELECT nama_lengkap, email, nomor_wa FROM users WHERE id = $1`,
    [order.buyer_user_id],
  );
  const c = buyer[0];

  const checkout = await provider.createCheckout({
    paymentId: payment.id,
    amount: total,
    currency,
    description: `Order ${orderId}`,
    customer: {
      name: c?.nama_lengkap ?? undefined,
      email: c?.email ?? undefined,
      phone: c?.nomor_wa ?? undefined,
    },
    returnUrl: `${env.PAYMENT_RETURN_URL}?order=${orderId}`,
    cancelUrl: `${env.PAYMENT_CANCEL_URL}?order=${orderId}`,
    notifyUrl: `${env.APP_URL}/api/v1/orders/webhook/${provider.id}`,
  });

  await query(`UPDATE payments SET referensi_gateway = $2 WHERE id = $1`, [
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
 * Handler webhook gateway (dipanggil TANPA auth — diverifikasi oleh adapter).
 * Idempoten: pembayaran yang sudah terverifikasi diabaikan.
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
    // Verifikasi gagal = bukan dari gateway. Jangan bocorkan detailnya.
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

  // Gateway lain tidak boleh menyelesaikan pembayaran milik gateway ini.
  if (payment.metode !== provider.id) {
    logger.warn(
      { provider: provider.id, payment: payment.id, metode: payment.metode },
      'Webhook refers to a payment belonging to another gateway — ignored',
    );
    return { ok: true, note: 'gateway mismatch — ignored' };
  }

  // idempotensi
  if (payment.status === 'terverifikasi') return { ok: true, note: 'already processed' };
  if (payment.status === 'ditolak' && event.outcome !== 'settlement') return { ok: true, note: 'already rejected' };

  if (event.outcome === 'settlement') {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        {
          status: 'terverifikasi',
          verified_by: null,
          verified_at: new Date(),
          catatan_verifikasi: event.note ?? provider.label,
        },
        tx,
      );
      await recomputeOrderStatus(tx, payment.order_id, null);
      await recordAudit(
        { userId: null, module: 'pembayaran', action: 'gateway_settlement', entity: 'payments', entityId: payment.id, after: { provider: provider.id, note: event.note } },
        tx,
      );
    });
  } else if (event.outcome === 'failed') {
    await withTransaction(async (tx) => {
      await repo.updatePaymentVerification(
        payment.id,
        { status: 'ditolak', verified_by: null, verified_at: new Date(), catatan_verifikasi: event.note ?? provider.label },
        tx,
      );
      await recordAudit(
        { userId: null, module: 'pembayaran', action: 'gateway_failed', entity: 'payments', entityId: payment.id, after: { provider: provider.id, note: event.note } },
        tx,
      );
    });
  }
  // pending / challenge: biarkan menunggu

  return { ok: true, outcome: event.outcome };
}

// ── Verifikasi pembayaran manual (admin_ops) (finansial) ──

export async function verify(actor: AuthContext, orderId: string, input: VerifyPaymentInput) {
  const order = await repo.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'order.not_found');
  // `payment_id` opsional: layar Transaksi menyetujui sebuah order, bukan sebuah
  // baris pembayaran, dan hampir semua order hanya punya satu klaim yang
  // menunggu. Bila ternyata ada lebih dari satu, minta penyebutnya secara
  // eksplisit alih-alih menebak yang mana.
  let payment;
  if (input.payment_id) {
    payment = await repo.paymentById(input.payment_id);
    if (!payment || payment.order_id !== orderId) throw AppError.notFound('Payment not found', 'payment.not_found');
    if (payment.status !== 'menunggu_verifikasi') throw AppError.conflict('This payment has already been verified or rejected', 'payment.already_decided');
  } else {
    const pending = (await repo.paymentsByOrder(orderId)).filter((p) => p.status === 'menunggu_verifikasi');
    if (!pending.length) throw AppError.notFound('This order has no payment waiting for verification', 'payment.none_pending');
    if (pending.length > 1) {
      throw AppError.badRequest('This order has several payments waiting — say which one', 'payment.ambiguous_pending', {
        payment_ids: pending.map((p) => p.id),
      });
    }
    payment = pending[0];
  }

  const newStatus = input.aksi === 'verify' ? 'terverifikasi' : 'ditolak';

  await withTransaction(async (tx) => {
    await repo.updatePaymentVerification(
      payment.id,
      { status: newStatus, verified_by: actor.userId, verified_at: new Date(), catatan_verifikasi: input.catatan_verifikasi ?? null },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'pembayaran',
        action: `verify_${input.aksi}`,
        entity: 'payments',
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: newStatus },
        reason: input.catatan_verifikasi ?? null,
      },
      tx,
    );
    if (newStatus === 'terverifikasi') await recomputeOrderStatus(tx, orderId, actor.userId);
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
  const nomor_invoice = `INV/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(seq).padStart(5, '0')}`;
  return repo.insertInvoice({ order_id: orderId, nomor_invoice });
}

// ── Refund (finansial — approval Direktur wajib) ──────────

export async function refund(actor: AuthContext, orderId: string, input: RefundInput) {
  if (!isDirektur(actor)) throw AppError.forbidden('Only a Director can approve a refund', 'refund.approve_requires_director');
  const order = await repo.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'order.not_found');
  if (!['lunas', 'akses_aktif'].includes(order.status)) {
    throw AppError.conflict('Only a paid order with active access can be refunded', 'refund.order_not_eligible');
  }
  if (input.nominal > Number(order.total)) throw AppError.badRequest('The refund amount is larger than the order total', 'refund.exceeds_order_total');

  const result = await withTransaction(async (tx) => {
    const now = new Date();
    // Direktur menyetujui & mengeksekusi dalam satu langkah (alur disederhanakan sesuai cakupan modul ini).
    const refundRow = await repo.insertRefund(
      {
        order_id: orderId,
        nominal: input.nominal,
        alasan: input.alasan,
        status: 'selesai',
        diajukan_oleh: actor.userId,
        disetujui_oleh: actor.userId,
        disetujui_at: now,
        diproses_at: now,
        metode_pengembalian: input.metode_pengembalian ?? null,
        catatan: input.catatan ?? null,
      },
      tx,
    );

    await repo.updateOrderStatus(orderId, 'batal', tx);
    // pembalikan revenue share (soft-delete — enum revenue_shares.status tidak menyediakan status reversal)
    await repo.softDeleteRevenueSharesByOrder(orderId, tx);
    await repo.cancelEnrollmentsByOrder(orderId, tx);
    await marketingService.reverseCommissionOnRefund(tx, orderId, input.alasan);

    await recordAudit(
      {
        userId: actor.userId,
        module: 'refund',
        action: 'refund_execute',
        entity: 'refunds',
        entityId: refundRow.id,
        before: { status: order.status },
        after: { status: 'batal', nominal: input.nominal },
        reason: input.alasan,
      },
      tx,
    );
    return refundRow;
  });

  return { refund: result, order: await detail(actor, orderId) };
}
