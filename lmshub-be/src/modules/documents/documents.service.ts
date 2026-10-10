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
import { sanitizeRichText } from '../../core/html/sanitize';
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

/** Halaman publik: hanya tampilkan bila `status = 'publish'`. */
export async function getPublicPage(slug: string) {
  const page = await repo.getPageBySlug(slug);
  if (!page || page.status !== 'publish') throw AppError.notFound('Page not found', 'page.not_found');
  return page;
}

/** register halaman publish untuk footer — tanpa content, tanpa penyunting. */
export async function listPublicPages() {
  return repo.listPublishedPages();
}

/**
 * Bentuk tersimpan `content_pages.content`.
 *
 * Editor Admin Panel mengirim `konten_html`; hasilnya disimpan sebagai
 * `{ format: 'html', html }` setelah disanitasi. Klien lama yang mengirim
 * `content` mentah tetap diterima, tetapi bila objek itu membawa `html`,
 * bagian itu ikut dibersihkan — no ada jalan menyimpan HTML kotor.
 *
 * `undefined` berarti "no diubah".
 */
export function normalizeKonten(input: { content?: unknown; konten_html?: string }): unknown {
  if (input.konten_html !== undefined) return { format: 'html', html: sanitizeRichText(input.konten_html) };
  if (input.content === undefined) return undefined;
  if (input.content && typeof input.content === 'object' && !Array.isArray(input.content)) {
    const k = input.content as Record<string, unknown>;
    if (typeof k.html === 'string') return { ...k, format: 'html', html: sanitizeRichText(k.html) };
  }
  return input.content;
}

async function assertSlugFree(slug: string, exceptId?: string) {
  const existing = await repo.getPageBySlug(slug);
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('That slug is already in use', 'common.slug_taken');
  }
}

export async function createPage(actor: AuthContext, input: CreatePageInput) {
  await assertSlugFree(input.slug);
  const { id } = await repo.insertPage({
    slug: input.slug,
    title: input.title,
    content: normalizeKonten(input),
    type: input.type,
    status: input.status,
    meta_seo: input.meta_seo,
    publish_date: input.status === 'publish' ? new Date().toISOString() : null,
    managed_by: actor.userId,
    show_in_footer: input.show_in_footer,
    footer_sort_order: input.footer_sort_order,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'content',
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

  const fields: Record<string, unknown> = { managed_by: actor.userId };
  if (input.slug !== undefined && input.slug !== before.slug) {
    await assertSlugFree(input.slug, id);
    fields.slug = input.slug;
  }
  if (input.title !== undefined) fields.title = input.title;
  const content = normalizeKonten(input);
  if (content !== undefined) fields.content = JSON.stringify(content);
  if (input.type !== undefined) fields.type = input.type;
  if (input.show_in_footer !== undefined) fields.show_in_footer = input.show_in_footer;
  if (input.footer_sort_order !== undefined) fields.footer_sort_order = input.footer_sort_order;
  if (input.meta_seo !== undefined) fields.meta_seo = input.meta_seo === null ? null : JSON.stringify(input.meta_seo);
  if (input.status !== undefined) {
    fields.status = input.status;
    if (input.status === 'publish' && !before.publish_date) {
      fields.publish_date = new Date().toISOString();
    }
  }
  await repo.updatePage(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'content',
    action: 'update',
    entity: 'content_pages',
    entityId: id,
    before: { status: before.status, slug: before.slug },
    // Isi halaman bisa sangat panjang; audit cukup mencatat field yang berubah.
    after: { ...input, content: undefined, konten_html: content !== undefined ? '[updated]' : undefined },
  });
  return repo.getPageById(id);
}

/** delete lunak — slug-nya bebas dipakai lagi, barisnya tetap ada untuk audit. */
export async function removePage(actor: AuthContext, id: string) {
  const before = await repo.getPageById(id);
  if (!before) throw AppError.notFound('Page not found', 'page.not_found');
  await repo.softDeletePage(id);
  await recordAudit({
    userId: actor.userId,
    module: 'content',
    action: 'delete',
    entity: 'content_pages',
    entityId: id,
    before: { slug: before.slug, status: before.status },
  });
}

// ── settings ─────────────────────────────────────────────────────────────

export async function listSettings() {
  const rows = await repo.listSettings();
  // Samarkan value kredensial terenkripsi saat read.
  return rows.map((s) => (s.is_encrypted ? { ...s, value: s.value ? SECRET_MASK : '' } : s));
}

/**
 * Setting publik sebagai map `key -> value`. Dipakai FE/mobile sebelum login untuk
 * hal-hal yang memengaruhi tampilan catalog — terutama mata uang price.
 */
export async function publicSettings(): Promise<Record<string, string>> {
  const rows = await repo.listPublicSettings();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? '';
  return out;
}

// ── Aset merek (logo & ikon) ─────────────────────────────────────────────

const BRAND_DIR = path.resolve(process.cwd(), 'uploads', 'branding');
const BRAND_MAX_BYTES = 512 * 1024; // 512KB — logo/ikon no perlu lebih besar
const BRAND_EXT: Record<UploadBrandAssetInput['mime_type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const BRAND_SETTING_KEY: Record<UploadBrandAssetInput['type'], string> = {
  logo: 'brand.logo_url',
  icon: 'brand.icon_url',
};

/**
 * save logo/ikon to `uploads/branding` lalu catat path-nya di settings.
 * name berkas diberi cap time supaya cache browser no menahan aset lama.
 */
export async function uploadBrandAsset(actor: AuthContext, input: UploadBrandAssetInput) {
  const raw = input.data_base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw AppError.badRequest('The image data is not valid', 'upload.image_invalid');
  if (buffer.length > BRAND_MAX_BYTES) throw AppError.badRequest('The file must be 512KB or smaller', 'upload.max_512kb');

  const key = BRAND_SETTING_KEY[input.type];
  const before = await repo.getSettingByKey(key);

  const filename = `${input.type}-${Date.now()}.${BRAND_EXT[input.mime_type]}`;
  try {
    await mkdir(BRAND_DIR, { recursive: true });
    await writeFile(path.join(BRAND_DIR, filename), buffer);
  } catch {
    // Direktori read-only (mis. kontainer dengan filesystem no bisa ditulis).
    throw AppError.badRequest('Could not save the file: the uploads/branding directory is not writable', 'upload.branding_dir_not_writable');
  }

  const url = `/uploads/branding/${filename}`;
  await repo.updateSetting(key, url, undefined);
  invalidateSettingsCache();

  // Buang berkas lama (best-effort — kegagalan di sini no boleh menggagalkan unggahan).
  if (before?.value?.startsWith('/uploads/branding/')) {
    await unlink(path.join(BRAND_DIR, path.basename(before.value))).catch(() => {});
  }

  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'update',
    entity: 'settings',
    entityId: before?.id ?? null,
    before: { value: before?.value ?? null },
    after: { value: url },
  });
  return { key, value: url };
}

/** Kosongkan logo/ikon dan delete berkasnya, mengembalikan tampilan bawaan. */
export async function removeBrandAsset(actor: AuthContext, type: UploadBrandAssetInput['type']) {
  const key = BRAND_SETTING_KEY[type];
  const before = await repo.getSettingByKey(key);

  await repo.updateSetting(key, '', undefined);
  invalidateSettingsCache();

  if (before?.value?.startsWith('/uploads/branding/')) {
    await unlink(path.join(BRAND_DIR, path.basename(before.value))).catch(() => {});
  }

  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'update',
    entity: 'settings',
    entityId: before?.id ?? null,
    before: { value: before?.value ?? null },
    after: { value: '' },
  });
  return { key, value: '' };
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
  const keepStored = before.is_encrypted && input.value?.trim() === SECRET_MASK;
  const value = keepStored ? before.value : (input.value ?? before.value);

  // Mengganti mata uang basis membuat setiap kurs yang tersimpan berubah arti,
  // jadi kursnya dinyatakan ulang terhadap basis baru SEBELUM setting disimpan.
  // Bila mata uang barunya belum terdaftar, penyimpanan dibatalkan — lebih baik
  // failed terang-terangan daripada meninggalkan catalog berprice salah.
  if (key === 'currency.code' && value && value.toUpperCase() !== (before.value ?? '').toUpperCase()) {
    await rebaseRates(before.value ?? '', value);
  }

  await repo.updateSetting(key, value, input.value_json);
  invalidateSettingsCache(); // agar mailer/google/bank memakai value terbaru
  invalidatePaymentSettings(); // gateway membaca kredensial from sini
  await recordAudit({
    userId: actor.userId,
    module: 'settings',
    action: 'update',
    entity: 'settings',
    entityId: before.id,
    before: { value: before.is_encrypted ? SECRET_MASK : before.value },
    after: { value: before.is_encrypted ? SECRET_MASK : value },
  });
  const updated = await repo.getSettingByKey(key);
  return updated && updated.is_encrypted ? { ...updated, value: updated.value ? SECRET_MASK : '' } : updated;
}

// ── audit_log ────────────────────────────────────────────────────────────

export async function listAuditLog(p: PageParams, f: repo.AuditLogFilters) {
  return repo.listAuditLog(p, f);
}

// ── Gateway payment (layar settings) ────────────────────────────────

/**
 * Metadata tiap gateway untuk layar settings.
 *
 * URL webhook dihitung di server, bukan diketik pembeli. Salah satu penyebab
 * paling sering "payment success tapi order no lunas" adalah URL webhook
 * yang salah ketik, dan itu no memunculkan error apa pun — order hanya diam
 * menggantung. Ditampilkan siap salin, error itu hilang.
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
      /** Kredensial sudah terisi (from settings atau .env). */
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
