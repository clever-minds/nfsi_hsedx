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
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    max_quota: input.max_quota ?? null,
    min_purchase: input.min_purchase ?? null,
    valid_from: input.valid_from ?? null,
    valid_until: input.valid_until ?? null,
    is_active: input.is_active ?? true,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'create',
    entity: 'coupons',
    entityId: id,
    after: { kode: input.kode, discount_type: input.discount_type, discount_value: input.discount_value },
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
  if (input.discount_type !== undefined) fields.discount_type = input.discount_type;
  if (input.discount_value !== undefined) fields.discount_value = input.discount_value;
  if (input.max_quota !== undefined) fields.max_quota = input.max_quota;
  if (input.min_purchase !== undefined) fields.min_purchase = input.min_purchase;
  if (input.valid_from !== undefined) fields.valid_from = input.valid_from;
  if (input.valid_until !== undefined) fields.valid_until = input.valid_until;
  if (input.is_active !== undefined) fields.is_active = input.is_active;

  // Kuota baru yang lebih kecil from pemakaian akan membuat kupon langsung mati
  // tanpa penjelasan di layar mana pun. reject di sini selagi sebabnya jelas.
  if (input.max_quota != null && input.max_quota < before.used_quota) {
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
    before: { kode: before.kode, discount_value: before.discount_value, is_active: before.is_active },
    after: input,
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  await detail(id);
  // Order menyimpan `coupon_id`; menghapus kupon yang sudah dipakai akan
  // mengosongkan jejak discount pada order lama (FK-nya ON DELETE SET NULL).
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
