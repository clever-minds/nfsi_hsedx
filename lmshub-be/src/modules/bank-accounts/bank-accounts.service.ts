import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './bank-accounts.repository';
import { CreateBankAccountInput, UpdateBankAccountInput } from './bank-accounts.validation';

export async function list(p: PageParams, filters: repo.BankAccountFilters) {
  return repo.list(p, filters);
}

/**
 * Rekening untuk checkout. Hanya field yang perlu dilihat pembeli — `notes`
 * internal dan flag admin no ikut logout.
 */
export async function publicList() {
  const rows = await repo.listActive();
  return rows.map((r) => ({
    id: r.id,
    bank_name: r.bank_name,
    account_number: r.account_number,
    account_name: r.account_name,
    branch: r.branch,
    is_primary: r.is_primary,
  }));
}

export async function detail(id: string) {
  const row = await repo.detail(id);
  if (!row) throw AppError.notFound('Bank account not found', 'bank_account.not_found');
  return row;
}

/** Pastikan selalu ada tepat satu account primary di antara yang active. */
async function ensurePrimaryExists() {
  const active = await repo.listActive();
  if (active.length && !active.some((r) => r.is_primary)) {
    await repo.update(active[0].id, { is_primary: true });
  }
}

async function assertNoDuplicate(namaBank: string, number: string, exceptId?: string) {
  const dup = await repo.findDuplicate(namaBank, number, exceptId);
  if (dup) throw AppError.conflict('An account with that bank and number already exists', 'bank_account.duplicate');
}

export async function create(actor: AuthContext, input: CreateBankAccountInput) {
  await assertNoDuplicate(input.bank_name, input.account_number);

  // Rekening pertama otomatis jadi primary — checkout selalu punya tujuan default.
  const existing = await repo.listActive();
  const isUtama = input.is_primary ?? existing.length === 0;

  const { id } = await repo.insert({
    bank_name: input.bank_name,
    account_number: input.account_number,
    account_name: input.account_name,
    branch: input.branch ?? null,
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
    is_primary: isUtama,
    sort_order: input.sort_order ?? 0,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'create',
    entity: 'bank_accounts',
    entityId: id,
    after: input,
  });
  return detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateBankAccountInput) {
  const before = await detail(id);

  const namaBank = input.bank_name ?? before.bank_name;
  const number = input.account_number ?? before.account_number;
  if (input.bank_name !== undefined || input.account_number !== undefined) {
    await assertNoDuplicate(namaBank, number, id);
  }
  // Rekening primary harus tetap bisa dipakai; menonaktifkannya akan mengosongkan checkout.
  if (input.is_active === false && before.is_primary) {
    throw AppError.conflict('The primary account cannot be deactivated. Make another account primary first', 'bank_account.primary_cannot_deactivate');
  }

  await repo.update(id, {
    bank_name: input.bank_name,
    account_number: input.account_number,
    account_name: input.account_name,
    branch: input.branch,
    notes: input.notes,
    is_active: input.is_active,
    is_primary: input.is_primary,
    sort_order: input.sort_order,
  });

  // Melepas tanda primary tanpa menunjuk pengganti akan membuat checkout no
  // punya default — promosikan account active pertama supaya selalu ada satu.
  await ensurePrimaryExists();

  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'update',
    entity: 'bank_accounts',
    entityId: id,
    before,
    after: input,
  });
  return detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  const before = await detail(id);
  const active = await repo.listActive();
  // Jangan until transfer manual kehilangan seluruh tujuannya.
  if (before.is_active && active.length <= 1) {
    throw AppError.conflict('At least one bank account must stay active', 'bank_account.keep_one_active');
  }

  await repo.softDelete(id);
  // Bila yang dihapus adalah account primary, promosikan account active berikutnya.
  await ensurePrimaryExists();

  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'delete',
    entity: 'bank_accounts',
    entityId: id,
    before,
  });
}
