import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './coupons.repository';
import { CreateCouponInput, UpdateCouponInput } from './coupons.validation';

export async function list(p: PageParams, filters: repo.Filters) {
  return repo.list(p, filters);
}

export async function detail(id: string) {
  const c = await repo.detail(id);
  if (!c) throw AppError.notFound('Coupon not found', 'coupon.not_found');
  return c;
}

export async function create(actor: AuthContext, input: CreateCouponInput) {
  const existing = await repo.byKode(input.kode);
  if (existing) throw AppError.conflict('That coupon code is already in use', 'coupon.code_taken');

  const { id } = await repo.insert({
    kode: input.kode,
    tipe_potongan: input.tipe_potongan,
    nilai_potongan: input.nilai_potongan,
    kuota_maksimal: input.kuota_maksimal ?? null,
    minimum_pembelian: input.minimum_pembelian ?? null,
    berlaku_mulai: input.berlaku_mulai ?? null,
    berlaku_sampai: input.berlaku_sampai ?? null,
    is_aktif: input.is_aktif ?? true,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'create',
    entity: 'coupons',
    entityId: id,
    after: { kode: input.kode, tipe_potongan: input.tipe_potongan, nilai_potongan: input.nilai_potongan },
  });
  return repo.detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateCouponInput) {
  const before = await detail(id);

  const fields: Record<string, unknown> = {};
  if (input.kode !== undefined) {
    const clash = await repo.byKode(input.kode);
    if (clash && clash.id !== id) throw AppError.conflict('That coupon code is already in use', 'coupon.code_taken');
    fields.kode = input.kode;
  }
  if (input.tipe_potongan !== undefined) fields.tipe_potongan = input.tipe_potongan;
  if (input.nilai_potongan !== undefined) fields.nilai_potongan = input.nilai_potongan;
  if (input.kuota_maksimal !== undefined) fields.kuota_maksimal = input.kuota_maksimal;
  if (input.minimum_pembelian !== undefined) fields.minimum_pembelian = input.minimum_pembelian;
  if (input.berlaku_mulai !== undefined) fields.berlaku_mulai = input.berlaku_mulai;
  if (input.berlaku_sampai !== undefined) fields.berlaku_sampai = input.berlaku_sampai;
  if (input.is_aktif !== undefined) fields.is_aktif = input.is_aktif;

  // Kuota baru yang lebih kecil dari pemakaian akan membuat kupon langsung mati
  // tanpa penjelasan di layar mana pun. Tolak di sini selagi sebabnya jelas.
  if (input.kuota_maksimal != null && input.kuota_maksimal < before.kuota_terpakai) {
    throw AppError.badRequest(
      'The quota cannot be lower than the number of times this coupon has already been redeemed',
      'coupon.quota_below_used',
    );
  }

  await repo.update(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'update',
    entity: 'coupons',
    entityId: id,
    before: { kode: before.kode, nilai_potongan: before.nilai_potongan, is_aktif: before.is_aktif },
    after: input,
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  await detail(id);
  // Order menyimpan `coupon_id`; menghapus kupon yang sudah dipakai akan
  // mengosongkan jejak diskon pada order lama (FK-nya ON DELETE SET NULL).
  // Nonaktifkan saja — kupon nonaktif sudah ditolak saat checkout.
  const used = await repo.countOrdersUsing(id);
  if (used > 0) {
    throw AppError.conflict(
      'This coupon has already been used on an order. Deactivate it instead of deleting it',
      'coupon.in_use',
    );
  }
  await repo.softDelete(id);
  await recordAudit({ userId: actor.userId, module: 'marketing', action: 'delete', entity: 'coupons', entityId: id });
}
