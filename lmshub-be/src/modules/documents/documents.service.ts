import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../core/http/AppError';
import { ensurePaymentSettings, gatewayEnabled, invalidatePaymentSettings } from '../../core/payment/config';
import { allProviders } from '../../core/payment/registry';
import { env } from '../../core/config/env';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import { invalidateSettingsCache } from '../../core/settings/settings';
import * as repo from './documents.repository';
import { rebaseRates } from '../currencies/currencies.service';
import {
  CreatePageInput,
  UpdatePageInput,
  UpdateSettingInput,
  UploadBrandAssetInput,
} from './documents.validation';

// ── content_pages ────────────────────────────────────────────────────────

export async function listPages(p: PageParams, f: repo.PageFilters) {
  return repo.listPages(p, f);
}

/** Halaman publik: hanya tampilkan bila `status = 'terbit'`. */
export async function getPublicPage(slug: string) {
  const page = await repo.getPageBySlug(slug);
  if (!page || page.status !== 'terbit') throw AppError.notFound('Page not found', 'page.not_found');
  return page;
}

export async function createPage(actor: AuthContext, input: CreatePageInput) {
  const existing = await repo.getPageBySlug(input.slug);
  if (existing) throw AppError.conflict('That slug is already in use', 'common.slug_taken');
  const { id } = await repo.insertPage({
    slug: input.slug,
    judul: input.judul,
    konten: input.konten,
    tipe: input.tipe,
    status: input.status,
    meta_seo: input.meta_seo,
    tanggal_terbit: input.status === 'terbit' ? new Date().toISOString() : null,
    dikelola_oleh: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'create',
    entity: 'content_pages',
    entityId: id,
    after: { slug: input.slug, status: input.status },
  });
  return repo.getPageById(id);
}

export async function updatePage(actor: AuthContext, id: string, input: UpdatePageInput) {
  const before = await repo.getPageById(id);
  if (!before) throw AppError.notFound('Page not found', 'page.not_found');

  const fields: Record<string, unknown> = { dikelola_oleh: actor.userId };
  if (input.judul !== undefined) fields.judul = input.judul;
  if (input.konten !== undefined) fields.konten = JSON.stringify(input.konten);
  if (input.tipe !== undefined) fields.tipe = input.tipe;
  if (input.meta_seo !== undefined) fields.meta_seo = input.meta_seo === null ? null : JSON.stringify(input.meta_seo);
  if (input.status !== undefined) {
    fields.status = input.status;
    if (input.status === 'terbit' && !before.tanggal_terbit) {
      fields.tanggal_terbit = new Date().toISOString();
    }
  }
  await repo.updatePage(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'update',
    entity: 'content_pages',
    entityId: id,
    before: { status: before.status },
    after: input,
  });
  return repo.getPageById(id);
}

// ── settings ─────────────────────────────────────────────────────────────

export async function listSettings() {
  const rows = await repo.listSettings();
  // Samarkan nilai kredensial terenkripsi saat dibaca.
  return rows.map((s) => (s.is_encrypted ? { ...s, nilai: s.nilai ? SECRET_MASK : '' } : s));
}

/**
 * Setting publik sebagai map `key -> nilai`. Dipakai FE/mobile sebelum login untuk
 * hal-hal yang memengaruhi tampilan katalog — terutama mata uang harga.
 */
export async function publicSettings(): Promise<Record<string, string>> {
  const rows = await repo.listPublicSettings();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.nilai ?? '';
  return out;
}

// ── Aset merek (logo & ikon) ─────────────────────────────────────────────

const BRAND_DIR = path.resolve(process.cwd(), 'uploads', 'branding');
const BRAND_MAX_BYTES = 512 * 1024; // 512KB — logo/ikon tidak perlu lebih besar
const BRAND_EXT: Record<UploadBrandAssetInput['mime_type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const BRAND_SETTING_KEY: Record<UploadBrandAssetInput['jenis'], string> = {
  logo: 'brand.logo_url',
  icon: 'brand.icon_url',
};

/**
 * Simpan logo/ikon ke `uploads/branding` lalu catat path-nya di settings.
 * Nama berkas diberi cap waktu supaya cache browser tidak menahan aset lama.
 */
export async function uploadBrandAsset(actor: AuthContext, input: UploadBrandAssetInput) {
  const raw = input.data_base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw AppError.badRequest('The image data is not valid', 'upload.image_invalid');
  if (buffer.length > BRAND_MAX_BYTES) throw AppError.badRequest('The file must be 512KB or smaller', 'upload.max_512kb');

  const key = BRAND_SETTING_KEY[input.jenis];
  const before = await repo.getSettingByKey(key);

  const filename = `${input.jenis}-${Date.now()}.${BRAND_EXT[input.mime_type]}`;
  try {
    await mkdir(BRAND_DIR, { recursive: true });
    await writeFile(path.join(BRAND_DIR, filename), buffer);
  } catch {
    // Direktori read-only (mis. kontainer dengan filesystem tidak bisa ditulis).
    throw AppError.badRequest('Could not save the file: the uploads/branding directory is not writable', 'upload.branding_dir_not_writable');
  }

  const url = `/uploads/branding/${filename}`;
  await repo.updateSetting(key, url, undefined);
  invalidateSettingsCache();

  // Buang berkas lama (best-effort — kegagalan di sini tidak boleh menggagalkan unggahan).
  if (before?.nilai?.startsWith('/uploads/branding/')) {
    await unlink(path.join(BRAND_DIR, path.basename(before.nilai))).catch(() => {});
  }

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'settings',
    entityId: before?.id ?? null,
    before: { nilai: before?.nilai ?? null },
    after: { nilai: url },
  });
  return { key, nilai: url };
}

/** Kosongkan logo/ikon dan hapus berkasnya, mengembalikan tampilan bawaan. */
export async function removeBrandAsset(actor: AuthContext, jenis: UploadBrandAssetInput['jenis']) {
  const key = BRAND_SETTING_KEY[jenis];
  const before = await repo.getSettingByKey(key);

  await repo.updateSetting(key, '', undefined);
  invalidateSettingsCache();

  if (before?.nilai?.startsWith('/uploads/branding/')) {
    await unlink(path.join(BRAND_DIR, path.basename(before.nilai))).catch(() => {});
  }

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'settings',
    entityId: before?.id ?? null,
    before: { nilai: before?.nilai ?? null },
    after: { nilai: '' },
  });
  return { key, nilai: '' };
}

/** Placeholder the API returns instead of a stored secret. */
const SECRET_MASK = '••••••••';

export async function updateSetting(actor: AuthContext, key: string, input: UpdateSettingInput) {
  const before = await repo.getSettingByKey(key);
  if (!before) throw AppError.notFound('Setting not found', 'setting.not_found');
  if (!before.is_editable) throw AppError.forbidden('This setting is locked and cannot be changed', 'setting.locked');

  // A secret is read back as `••••••••`, so a form that simply resubmits every
  // field posts the mask instead of the key. Written literally, that silently
  // replaces a working credential with eight dots and the gateway starts
  // failing with no visible cause. Receiving the mask means "leave it alone".
  const keepStored = before.is_encrypted && input.nilai?.trim() === SECRET_MASK;
  const nilai = keepStored ? before.nilai : (input.nilai ?? before.nilai);

  // Mengganti mata uang basis membuat setiap kurs yang tersimpan berubah arti,
  // jadi kursnya dinyatakan ulang terhadap basis baru SEBELUM setting disimpan.
  // Bila mata uang barunya belum terdaftar, penyimpanan dibatalkan — lebih baik
  // gagal terang-terangan daripada meninggalkan katalog berharga salah.
  if (key === 'currency.code' && nilai && nilai.toUpperCase() !== (before.nilai ?? '').toUpperCase()) {
    await rebaseRates(before.nilai ?? '', nilai);
  }

  await repo.updateSetting(key, nilai, input.nilai_json);
  invalidateSettingsCache(); // agar mailer/google/bank memakai nilai terbaru
  invalidatePaymentSettings(); // gateway membaca kredensial dari sini
  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'settings',
    entityId: before.id,
    before: { nilai: before.is_encrypted ? SECRET_MASK : before.nilai },
    after: { nilai: before.is_encrypted ? SECRET_MASK : nilai },
  });
  const updated = await repo.getSettingByKey(key);
  return updated && updated.is_encrypted ? { ...updated, nilai: updated.nilai ? SECRET_MASK : '' } : updated;
}

// ── audit_log ────────────────────────────────────────────────────────────

export async function listAuditLog(p: PageParams, f: repo.AuditLogFilters) {
  return repo.listAuditLog(p, f);
}

// ── Gateway pembayaran (layar Pengaturan) ────────────────────────────────

/**
 * Metadata tiap gateway untuk layar Pengaturan.
 *
 * URL webhook dihitung di server, bukan diketik pembeli. Salah satu penyebab
 * paling sering "pembayaran berhasil tapi order tidak lunas" adalah URL webhook
 * yang salah ketik, dan itu tidak memunculkan error apa pun — order hanya diam
 * menggantung. Ditampilkan siap salin, kesalahan itu hilang.
 */
export async function paymentGateways() {
  await ensurePaymentSettings();
  const base = env.APP_URL.replace(/\/+$/, '');

  return allProviders().map((p) => {
    const configured = p.isConfigured();
    const currencies = p.supportedCurrencies();
    return {
      id: p.id,
      label: p.label,
      /** Kredensial sudah terisi (dari Pengaturan atau .env). */
      configured,
      /** Ditawarkan di checkout sekarang. */
      active: configured && gatewayEnabled(p.id, configured),
      /** Daftarkan URL ini di dashboard gateway. */
      webhook_url: `${base}/api/v1/orders/webhook/${p.id}`,
      /** `null` berarti mengikuti mata uang akun gateway. */
      currencies,
      /** Grup setting tempat kredensialnya diisi. */
      settings_group: `payment_${p.id}`,
    };
  });
}
