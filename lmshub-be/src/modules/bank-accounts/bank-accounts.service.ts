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
 * Rekening untuk checkout. Hanya field yang perlu dilihat pembeli — `catatan`
 * internal dan flag admin tidak ikut keluar.
 */
export async function publicList() {
  const rows = await repo.listActive();
  return rows.map((r) => ({
    id: r.id,
    nama_bank: r.nama_bank,
    nomor_rekening: r.nomor_rekening,
    atas_nama: r.atas_nama,
    cabang: r.cabang,
    is_utama: r.is_utama,
  }));
}

export async function detail(id: string) {
  const row = await repo.detail(id);
  if (!row) throw AppError.notFound('Bank account not found', 'bank_account.not_found');
  return row;
}

/** Pastikan selalu ada tepat satu rekening utama di antara yang aktif. */
async function ensurePrimaryExists() {
  const aktif = await repo.listActive();
  if (aktif.length && !aktif.some((r) => r.is_utama)) {
    await repo.update(aktif[0].id, { is_utama: true });
  }
}

async function assertNoDuplicate(namaBank: string, nomor: string, exceptId?: string) {
  const dup = await repo.findDuplicate(namaBank, nomor, exceptId);
  if (dup) throw AppError.conflict('An account with that bank and number already exists', 'bank_account.duplicate');
}

export async function create(actor: AuthContext, input: CreateBankAccountInput) {
  await assertNoDuplicate(input.nama_bank, input.nomor_rekening);

  // Rekening pertama otomatis jadi utama — checkout selalu punya tujuan default.
  const existing = await repo.listActive();
  const isUtama = input.is_utama ?? existing.length === 0;

  const { id } = await repo.insert({
    nama_bank: input.nama_bank,
    nomor_rekening: input.nomor_rekening,
    atas_nama: input.atas_nama,
    cabang: input.cabang ?? null,
    catatan: input.catatan ?? null,
    is_aktif: input.is_aktif ?? true,
    is_utama: isUtama,
    urutan: input.urutan ?? 0,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'create',
    entity: 'bank_accounts',
    entityId: id,
    after: input,
  });
  return detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateBankAccountInput) {
  const before = await detail(id);

  const namaBank = input.nama_bank ?? before.nama_bank;
  const nomor = input.nomor_rekening ?? before.nomor_rekening;
  if (input.nama_bank !== undefined || input.nomor_rekening !== undefined) {
    await assertNoDuplicate(namaBank, nomor, id);
  }
  // Rekening utama harus tetap bisa dipakai; menonaktifkannya akan mengosongkan checkout.
  if (input.is_aktif === false && before.is_utama) {
    throw AppError.conflict('The primary account cannot be deactivated. Make another account primary first', 'bank_account.primary_cannot_deactivate');
  }

  await repo.update(id, {
    nama_bank: input.nama_bank,
    nomor_rekening: input.nomor_rekening,
    atas_nama: input.atas_nama,
    cabang: input.cabang,
    catatan: input.catatan,
    is_aktif: input.is_aktif,
    is_utama: input.is_utama,
    urutan: input.urutan,
  });

  // Melepas tanda utama tanpa menunjuk pengganti akan membuat checkout tidak
  // punya default — promosikan rekening aktif pertama supaya selalu ada satu.
  await ensurePrimaryExists();

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
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
  const aktif = await repo.listActive();
  // Jangan sampai transfer manual kehilangan seluruh tujuannya.
  if (before.is_aktif && aktif.length <= 1) {
    throw AppError.conflict('At least one bank account must stay active', 'bank_account.keep_one_active');
  }

  await repo.softDelete(id);
  // Bila yang dihapus adalah rekening utama, promosikan rekening aktif berikutnya.
  await ensurePrimaryExists();

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'delete',
    entity: 'bank_accounts',
    entityId: id,
    before,
  });
}
