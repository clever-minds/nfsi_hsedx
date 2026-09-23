import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { getSetting, invalidateSettingsCache } from '../../core/settings/settings';
import * as repo from './currencies.repository';
import type { CreateCurrencyInput, UpdateCurrencyInput } from './currencies.validation';

/**
 * Currencies offered for display.
 *
 * The base currency is whichever one `currency.code` names. Every stored amount
 * is in that currency; the others exist only to show the same amount a second
 * way. `rate` reads as "one base unit equals this many".
 *
 * Two rules are enforced rather than trusted, because both are silent when
 * broken: the base currency always has a rate of exactly 1, and it can never be
 * deactivated or deleted. A base at rate 0.9, or missing, reprices the whole
 * catalogue with nothing on screen to say so.
 */

export async function baseCode(): Promise<string> {
  return (await getSetting('currency.code', 'USD')).toUpperCase();
}

export interface PublicCurrency {
  kode: string;
  nama: string;
  simbol: string;
  rate: number;
  desimal: number;
  is_basis: boolean;
}

/** Active currencies for the storefront. Public: the pre-login catalogue needs prices. */
export async function publicList(): Promise<{ base: string; switcher: boolean; currencies: PublicCurrency[] }> {
  const base = await baseCode();
  const rows = await repo.list(true);
  const switcher = (await getSetting('currency.switcher_enabled', 'false')) === 'true';

  const currencies = rows.map((r) => ({
    kode: r.kode.toUpperCase(),
    nama: r.nama,
    simbol: r.simbol,
    // The base is pinned to 1 on the way out too, so a bad stored rate cannot
    // reach a price label even if it somehow got past the write path.
    rate: r.kode.toUpperCase() === base ? 1 : Number(r.rate),
    desimal: r.desimal,
    is_basis: r.kode.toUpperCase() === base,
  }));

  // A store whose base is not in the table still has to be able to show prices.
  if (!currencies.some((c) => c.is_basis)) {
    currencies.unshift({ kode: base, nama: base, simbol: '', rate: 1, desimal: 2, is_basis: true });
  }

  return { base, switcher, currencies };
}

export async function list(): Promise<{ base: string; currencies: Array<repo.CurrencyRow & { is_basis: boolean }> }> {
  const base = await baseCode();
  const rows = await repo.list(false);
  return {
    base,
    currencies: rows.map((r) => ({ ...r, is_basis: r.kode.toUpperCase() === base })),
  };
}

export async function create(actor: AuthContext, input: CreateCurrencyInput) {
  const existing = await repo.byKode(input.kode);
  if (existing) throw AppError.conflict('That currency is already on the list', 'currency.duplicate');

  const base = await baseCode();
  const row = await repo.insert({
    ...input,
    rate: input.kode === base ? 1 : input.rate,
    is_aktif: input.kode === base ? true : input.is_aktif,
  });

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'create',
    entity: 'currencies',
    entityId: row.id,
    after: { kode: row.kode, rate: row.rate },
  });
  return row;
}

export async function update(actor: AuthContext, id: string, input: UpdateCurrencyInput) {
  const before = await repo.byId(id);
  if (!before) throw AppError.notFound('Currency not found', 'currency.not_found');

  const base = await baseCode();
  const isBase = before.kode.toUpperCase() === base;

  if (isBase) {
    if (input.rate !== undefined && Number(input.rate) !== 1) {
      throw AppError.badRequest(
        'The base currency is always 1. Change the base under Settings if you meant to price in a different currency.',
        'currency.base_rate_fixed',
      );
    }
    if (input.is_aktif === false) {
      throw AppError.badRequest('The base currency cannot be switched off', 'currency.base_must_stay_active');
    }
  }

  const row = await repo.update(id, isBase ? { ...input, rate: 1, is_aktif: true } : input);
  if (!row) throw AppError.notFound('Currency not found', 'currency.not_found');

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'currencies',
    entityId: id,
    before: { rate: before.rate, is_aktif: before.is_aktif },
    after: { rate: row.rate, is_aktif: row.is_aktif },
  });
  invalidateSettingsCache();
  return row;
}

export async function remove(actor: AuthContext, id: string) {
  const before = await repo.byId(id);
  if (!before) throw AppError.notFound('Currency not found', 'currency.not_found');

  if (before.kode.toUpperCase() === (await baseCode())) {
    throw AppError.badRequest(
      'The base currency cannot be removed. Choose a different base under Settings first.',
      'currency.base_cannot_delete',
    );
  }

  await repo.softDelete(id);
  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'delete',
    entity: 'currencies',
    entityId: id,
    before: { kode: before.kode },
  });
  return { deleted: true };
}

/**
 * Re-express every rate against a new base currency.
 *
 * Rates read as "one base unit equals this many". The moment the base changes,
 * every stored rate silently means something else — after switching USD to IDR,
 * a stored 16250 claims one rupiah is worth sixteen thousand rupiah, and every
 * price on the site is wrong with nothing on screen to say so.
 *
 * Dividing through by the new base's old rate preserves each relationship
 * exactly: if 1 USD was 16250 IDR and 0.92 EUR, then after moving to IDR one
 * rupiah is 1/16250 USD and 0.92/16250 EUR.
 *
 * Amounts already stored are NOT touched — they were recorded in the old base
 * and re-pricing them here would rewrite the value of every past order. That is
 * a decision for whoever changes the base, and the setting says so.
 */
export async function rebaseRates(oldBase: string, newBase: string): Promise<void> {
  if (oldBase.toUpperCase() === newBase.toUpperCase()) return;

  const target = await repo.byKode(newBase);
  if (!target) {
    throw AppError.badRequest(
      `Add ${newBase.toUpperCase()} on the Currencies page before making it the base.`,
      'currency.base_not_listed',
    );
  }

  const divisor = Number(target.rate);
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw AppError.badRequest(
      `${newBase.toUpperCase()} has no usable rate, so the other currencies cannot be re-expressed against it.`,
      'currency.base_rate_unusable',
    );
  }

  for (const row of await repo.list(false)) {
    const next = row.kode.toUpperCase() === newBase.toUpperCase() ? 1 : Number(row.rate) / divisor;
    await repo.update(row.id, { rate: next });
  }
}
