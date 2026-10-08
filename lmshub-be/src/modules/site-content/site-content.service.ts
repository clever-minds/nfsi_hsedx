import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import { recordAudit } from '../../core/audit/audit';
import { IMAGE_EXT, sniffImageMime } from '../../core/upload/image';
import * as repo from './site-content.repository';
import {
  DEFAULT_SITE_CONTENT,
  SECTION_KEYS,
  SITE_CONTENT_KEYS,
  type SiteContent,
  type SiteContentKey,
} from './site-content.defaults';
import { SITE_CONTENT_SCHEMA, type UploadSiteAssetInput } from './site-content.validation';

/**
 * Gabungkan bawaan dengan yang tersimpan.
 *
 * Objek digabung per field agar field baru yang ditambahkan di rilis berikutnya
 * tetap punya nilai bawaan walau baris di database ditulis versi lama. Array
 * justru diambil apa adanya: untuk daftar (sosmed, kolom footer, sort_order seksi)
 * "yang tersimpan" adalah keseluruhan jawaban — menggabungkannya per indeks
 * akan menghidupkan kembali elemen yang sengaja dihapus admin.
 */
function merge<T>(bawaan: T, tersimpan: unknown): T {
  if (tersimpan === null || tersimpan === undefined) return bawaan;
  if (Array.isArray(bawaan)) return (Array.isArray(tersimpan) ? tersimpan : bawaan) as T;
  if (typeof bawaan !== 'object' || typeof tersimpan !== 'object' || Array.isArray(tersimpan)) {
    return tersimpan as T;
  }
  const out = { ...(bawaan as Record<string, unknown>) };
  for (const [k, v] of Object.entries(tersimpan as Record<string, unknown>)) {
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out as T;
}

/**
 * Lengkapi daftar seksi: seksi yang belum pernah disimpan ditempel di akhir.
 * Tanpa ini, seksi baru dari rilis berikutnya tidak akan pernah tampil di
 * instalasi yang sudah pernah menyimpan sort_order.
 */
function lengkapiSections(rows: SiteContent['sections']): SiteContent['sections'] {
  const ada = new Set(rows.map((r) => r.key));
  const tambahan = DEFAULT_SITE_CONTENT.sections.filter((s) => !ada.has(s.key));
  // Seksi yang sudah tidak dikenal lagi (dihapus dari kode) ikut dibuang.
  const dikenal = rows.filter((r) => (SECTION_KEYS as readonly string[]).includes(r.key));
  return [...dikenal, ...tambahan];
}

/** Seluruh isi halaman publik, siap dipakai frontend tanpa penyesuaian lagi. */
export async function getAll(): Promise<SiteContent> {
  const rows = await repo.listAll();
  const tersimpan = new Map(rows.map((r) => [r.key, r.nilai]));
  const out: Record<string, unknown> = {};
  for (const key of SITE_CONTENT_KEYS) {
    out[key] = merge(DEFAULT_SITE_CONTENT[key], tersimpan.get(key));
  }
  const content = out as unknown as SiteContent;
  content.sections = lengkapiSections(content.sections);
  return content;
}

export async function updateBlock(actor: AuthContext, key: SiteContentKey, body: unknown) {
  const schema = SITE_CONTENT_SCHEMA[key];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => [i.path.join('.'), i.message].join(' ')).join('; ');
    throw AppError.badRequest(`Block "${key}" has invalid content: ${detail}`, 'site_content.block_invalid');
  }

  const before = await repo.getByKey(key);
  const row = await repo.upsert(key, parsed.data);

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'site_content',
    entityId: row.id,
    before: { nilai: before?.nilai ?? null },
    after: { nilai: parsed.data },
  });

  return { key, nilai: row.nilai };
}

// ── Aset halaman publik ──────────────────────────────────────────────────

const SITE_DIR = path.resolve(process.cwd(), 'uploads', 'site');
/** Jalur lama (JSON base64) — dibatasi body parser 4MB, jadi gambar efektif ≤2MB. */
const SITE_MAX_BYTES = 2 * 1024 * 1024;
/** Jalur unggah langsung (byte mentah) — tidak melewati body parser JSON. */
export const HERO_MAX_BYTES = 5 * 1024 * 1024;
const HERO_MAX_MB = HERO_MAX_BYTES / 1024 / 1024;

/**
 * Catat gambar hero yang sudah tersimpan di disk, buang yang lama, audit.
 * Dipakai kedua jalur unggah supaya perilakunya tidak bisa lepas sinkron.
 */
async function pasangHero(actor: AuthContext, filename: string) {
  const content = await getAll();
  const lama = content.hero.gambar_url;
  const url = `/uploads/site/${filename}`;
  await repo.upsert('hero', { ...content.hero, gambar_url: url });
  await hapusBerkas(lama);

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'site_content',
    entityId: null,
    before: { gambar_url: lama },
    after: { gambar_url: url },
  });
  return { jenis: 'hero' as const, url };
}

/** Simpan gambar hero (JSON base64 — jalur lama, tetap didukung) lalu catat path-nya di blok `hero`. */
export async function uploadAsset(actor: AuthContext, input: UploadSiteAssetInput) {
  const raw = input.data_base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw AppError.badRequest('The image data is not valid', 'upload.image_invalid');
  if (buffer.length > SITE_MAX_BYTES) throw AppError.badRequest('The file must be 2MB or smaller', 'upload.max_2mb');
  const mime = sniffImageMime(buffer);
  if (!mime) throw AppError.badRequest('The file is not a JPG, PNG or WebP image', 'upload.image_type_invalid');

  // Cap waktu di name berkas supaya cache browser tidak menahan gambar lama.
  const filename = `${input.jenis}-${Date.now()}.${IMAGE_EXT[mime]}`;
  try {
    await mkdir(SITE_DIR, { recursive: true });
    await writeFile(path.join(SITE_DIR, filename), buffer);
  } catch {
    throw AppError.badRequest('Could not save the file: the uploads/site directory is not writable', 'upload.site_dir_not_writable');
  }
  return pasangHero(actor, filename);
}

/**
 * Unggah gambar hero sebagai byte mentah (`Content-Type` = tipe gambarnya),
 * mekanisme yang sama dengan Media Library.
 *
 * Jalur base64 lama membengkakkan berkas ±33% dan melewati body parser JSON,
 * sehingga gambar foto biasa (2–4MB) ditolak — sering kali bahkan sebelum
 * sampai ke aplikasi, oleh batas `client_max_body_size` Nginx (bawaan 1MB).
 * Di sini berkas dialirkan ke disk, dibatasi 5MB, lalu jenisnya diperiksa dari
 * isinya sendiri.
 */
export async function uploadHeroStream(actor: AuthContext, req: Request) {
  const declaredMime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!(declaredMime in IMAGE_EXT)) {
    throw AppError.badRequest('Upload a JPG, PNG or WebP image', 'upload.image_type_invalid', {
      accepted: Object.keys(IMAGE_EXT),
    });
  }
  const tooLarge = () =>
    AppError.badRequest(`The image must be ${HERO_MAX_MB} MB or smaller`, 'upload.max_5mb', { max_mb: HERO_MAX_MB });
  if (Number(req.headers['content-length'] ?? 0) > HERO_MAX_BYTES) throw tooLarge();

  try {
    await mkdir(SITE_DIR, { recursive: true });
  } catch {
    throw AppError.badRequest('Could not save the file: the uploads/site directory is not writable', 'upload.site_dir_not_writable');
  }
  const tmp = path.join(SITE_DIR, `.upload-${randomUUID()}`);

  let size = 0;
  let head = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > HERO_MAX_BYTES) return cb(tooLarge());
      if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
      cb(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, createWriteStream(tmp));
  } catch (e) {
    await unlink(tmp).catch(() => {});
    if (e instanceof AppError) throw e;
    throw AppError.badRequest('The upload was interrupted. Please try again.', 'media.upload_interrupted');
  }

  const mime = sniffImageMime(head);
  if (size === 0 || !mime) {
    await unlink(tmp).catch(() => {});
    throw size === 0
      ? AppError.badRequest('The file is empty', 'media.empty')
      : AppError.badRequest('The file is not a JPG, PNG or WebP image', 'upload.image_type_invalid');
  }

  // Ekstensi mengikuti isi berkas, bukan label dari klien.
  const filename = `hero-${Date.now()}.${IMAGE_EXT[mime]}`;
  await rename(tmp, path.join(SITE_DIR, filename));
  return pasangHero(actor, filename);
}

export async function removeAsset(actor: AuthContext, jenis: UploadSiteAssetInput['jenis']) {
  const content = await getAll();
  const lama = content.hero.gambar_url;

  await repo.upsert('hero', { ...content.hero, gambar_url: '' });
  await hapusBerkas(lama);

  await recordAudit({
    userId: actor.userId,
    module: 'pengaturan',
    action: 'update',
    entity: 'site_content',
    entityId: null,
    before: { gambar_url: lama },
    after: { gambar_url: '' },
  });
  return { jenis, url: '' };
}

/** Buang berkas lama — best-effort; kegagalannya tidak boleh membatalkan unggahan. */
async function hapusBerkas(url: string) {
  if (!url.startsWith('/uploads/site/')) return;
  await unlink(path.join(SITE_DIR, path.basename(url))).catch(() => {});
}
