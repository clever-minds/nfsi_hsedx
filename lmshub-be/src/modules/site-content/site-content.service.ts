import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import { recordAudit } from '../../core/audit/audit';
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
 * justru diambil apa adanya: untuk daftar (sosmed, kolom footer, urutan seksi)
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
 * instalasi yang sudah pernah menyimpan urutan.
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
  const konten = out as unknown as SiteContent;
  konten.sections = lengkapiSections(konten.sections);
  return konten;
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
const SITE_MAX_BYTES = 2 * 1024 * 1024; // 2MB — gambar hero tampil besar
const SITE_EXT: Record<UploadSiteAssetInput['mime_type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Simpan gambar hero lalu catat path-nya di blok `hero`. */
export async function uploadAsset(actor: AuthContext, input: UploadSiteAssetInput) {
  const raw = input.data_base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw AppError.badRequest('The image data is not valid', 'upload.image_invalid');
  if (buffer.length > SITE_MAX_BYTES) throw AppError.badRequest('The file must be 2MB or smaller', 'upload.max_2mb');

  const konten = await getAll();
  const lama = konten.hero.gambar_url;

  // Cap waktu di nama berkas supaya cache browser tidak menahan gambar lama.
  const filename = `${input.jenis}-${Date.now()}.${SITE_EXT[input.mime_type]}`;
  try {
    await mkdir(SITE_DIR, { recursive: true });
    await writeFile(path.join(SITE_DIR, filename), buffer);
  } catch {
    throw AppError.badRequest('Could not save the file: the uploads/site directory is not writable', 'upload.site_dir_not_writable');
  }

  const url = `/uploads/site/${filename}`;
  await repo.upsert('hero', { ...konten.hero, gambar_url: url });
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
  return { jenis: input.jenis, url };
}

export async function removeAsset(actor: AuthContext, jenis: UploadSiteAssetInput['jenis']) {
  const konten = await getAll();
  const lama = konten.hero.gambar_url;

  await repo.upsert('hero', { ...konten.hero, gambar_url: '' });
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
