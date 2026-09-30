import { createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import { env } from '../../core/config/env';
import * as repo from './media.repository';
import { CreateMediaInput, UpdateStatusInput } from './media.validation';

const ADMIN_ROLES = ['super_admin', 'direktur', 'ketua', 'pembina', 'admin_ops'];
const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isAdmin = (actor: AuthContext) => actor.roles.some((r) => ADMIN_ROLES.includes(r));

function assertOwnerOrAdmin(actor: AuthContext, asset: repo.MediaAssetRow): void {
  if (isSuper(actor) || isAdmin(actor)) return;
  if (asset.uploader_id !== actor.userId) {
    throw AppError.forbidden('You can only manage your own media assets', 'media.not_owner');
  }
}

export async function list(actor: AuthContext, p: PageParams, filters: repo.Filters) {
  const scopeUploaderId = isSuper(actor) || isAdmin(actor) ? null : actor.userId;
  return repo.list(p, { ...filters, scopeUploaderId });
}

export async function detail(actor: AuthContext, id: string) {
  const a = await repo.detail(id);
  if (!a) throw AppError.notFound('Media asset not found', 'media.not_found');
  assertOwnerOrAdmin(actor, a);
  return a;
}

export async function create(actor: AuthContext, input: CreateMediaInput) {
  const { id } = await repo.insert({
    uploader_id: actor.userId,
    tipe_file: input.tipe_file,
    nama_file: input.nama_file,
    path_object_storage: input.path_object_storage,
    mime_type: input.mime_type ?? null,
    ukuran_bytes: input.ukuran_bytes ?? null,
    checksum: input.checksum ?? null,
    meta: input.meta ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'create',
    entity: 'media_assets',
    entityId: id,
    after: { tipe_file: input.tipe_file, nama_file: input.nama_file },
  });
  return repo.detail(id);
}

/** Perbarui status pipeline transcode: menunggu → memproses → selesai/gagal. */
export async function updateStatus(actor: AuthContext, id: string, input: UpdateStatusInput) {
  const asset = await detail(actor, id);
  await repo.updateStatus(id, input.status_transcode, input.hls_manifest_url ?? null, input.durasi_detik ?? null);
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'update_status',
    entity: 'media_assets',
    entityId: id,
    before: { status_transcode: asset.status_transcode },
    after: { status_transcode: input.status_transcode },
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  const asset = await detail(actor, id);
  const used = await repo.usageCount(id);
  if (used > 0) {
    throw AppError.conflict('This media is still used by a course or lesson and cannot be permanently deleted', 'media.in_use');
  }
  await repo.softDelete(id);
  // Files uploaded through the library are ours to clean up; a registered
  // external path or URL is not.
  if (asset.path_object_storage.startsWith(`${UPLOAD_URL_PREFIX}/`)) {
    await unlink(path.join(UPLOAD_DIR, path.basename(asset.path_object_storage))).catch(() => {});
  }
  await recordAudit({ userId: actor.userId, module: 'konten', action: 'delete', entity: 'media_assets', entityId: id });
  return asset;
}

/**
 * Resolve a media asset to a URL a browser can actually open.
 *
 * Files are served straight from disk at `/uploads`. There is no object store
 * behind this yet, so there is no such thing here as a link that expires: the
 * previous version returned a token URL with an `expires_at` and a route that
 * served it never existed, which meant every caller received a dead link that
 * looked protected. Naming it `signed` while handing out a permanent public
 * path would repeat that, so the response says plainly what it is.
 *
 * When S3-compatible storage lands, this is the single place that changes —
 * `expiring: true` and a real presigned URL, with the same response shape.
 */
export async function signedUrl(actor: AuthContext, id: string) {
  const asset = await detail(actor, id);
  if (asset.tipe_file === 'video' && asset.status_transcode !== 'selesai') {
    throw AppError.conflict('This video is still being processed', 'media.transcode_pending');
  }

  const stored = (asset.path_object_storage ?? '').trim();
  if (!stored) {
    throw AppError.conflict('This asset has no stored file path', 'media.no_path');
  }

  // A caller may have registered a full URL (an external CDN, a YouTube link).
  // Rewriting that into a local path would break it.
  const url = /^https?:\/\//.test(stored)
    ? stored
    : `${env.APP_URL.replace(/\/+$/, '')}/uploads/${stored.replace(/^\/+/, '').replace(/^uploads\//, '')}`;

  return {
    url,
    /** False while files are served from disk: the URL does not expire. */
    expiring: false,
    expires_at: null,
  };
}

// ── Direct upload ─────────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'media');
const UPLOAD_URL_PREFIX = '/uploads/media';

/**
 * Formats a browser plays natively. There is no transcode worker, so anything
 * accepted here must already be playable as uploaded — which is why a
 * QuickTime/MKV/AVI file is refused rather than stored and left unplayable.
 */
const ACCEPTED: Record<string, { tipe: 'video' | 'gambar' | 'dokumen' | 'audio'; ext: string }> = {
  'video/mp4': { tipe: 'video', ext: 'mp4' },
  'video/webm': { tipe: 'video', ext: 'webm' },
  'video/ogg': { tipe: 'video', ext: 'ogv' },
  'audio/mpeg': { tipe: 'audio', ext: 'mp3' },
  'audio/mp4': { tipe: 'audio', ext: 'm4a' },
  'audio/x-m4a': { tipe: 'audio', ext: 'm4a' },
  'audio/wav': { tipe: 'audio', ext: 'wav' },
  'audio/ogg': { tipe: 'audio', ext: 'ogg' },
  'image/jpeg': { tipe: 'gambar', ext: 'jpg' },
  'image/png': { tipe: 'gambar', ext: 'png' },
  'image/webp': { tipe: 'gambar', ext: 'webp' },
  'application/pdf': { tipe: 'dokumen', ext: 'pdf' },
};

export const acceptedMimeTypes = Object.keys(ACCEPTED);

/**
 * Stream the request body straight to disk and register it in the library.
 *
 * The body is the raw file (`Content-Type` = the file's own type), not JSON or
 * multipart: a lesson video is routinely hundreds of megabytes, and buffering
 * it — as the base64 photo/logo uploads do — would hold all of it in memory.
 * Streaming also needs no extra dependency on the buyer's server.
 */
export async function upload(actor: AuthContext, req: Request) {
  const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  let kind = ACCEPTED[mime];
  if (!kind) {
    const fallbackExt = mime.includes('/') ? mime.split('/')[1].replace(/[^a-zA-Z0-9]/g, '') : 'bin';
    kind = { tipe: 'dokumen', ext: fallbackExt || 'bin' };
  }

  const maxBytes = env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024;
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > maxBytes) {
    throw AppError.badRequest(`The file is larger than ${env.MEDIA_MAX_UPLOAD_MB} MB`, 'media.too_large', {
      max_mb: env.MEDIA_MAX_UPLOAD_MB,
    });
  }

  const rawName = String(req.headers['x-file-name'] ?? '');
  let originalName = '';
  try {
    originalName = decodeURIComponent(rawName);
  } catch {
    originalName = rawName;
  }
  originalName = path.basename(originalName).slice(0, 255) || `upload.${kind.ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}.${kind.ext}`;
  const target = path.join(UPLOAD_DIR, filename);

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) {
        cb(AppError.badRequest(`The file is larger than ${env.MEDIA_MAX_UPLOAD_MB} MB`, 'media.too_large', {
          max_mb: env.MEDIA_MAX_UPLOAD_MB,
        }));
        return;
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, createWriteStream(target));
  } catch (e) {
    await unlink(target).catch(() => {});
    if (e instanceof AppError) throw e;
    throw AppError.badRequest('The upload was interrupted. Please try again.', 'media.upload_interrupted');
  }
  if (size === 0) {
    await unlink(target).catch(() => {});
    throw AppError.badRequest('The file is empty', 'media.empty');
  }

  const { id } = await repo.insert({
    uploader_id: actor.userId,
    tipe_file: kind.tipe,
    nama_file: originalName,
    path_object_storage: `${UPLOAD_URL_PREFIX}/${filename}`,
    mime_type: mime,
    ukuran_bytes: size,
    checksum: null,
    meta: { source: 'upload' },
    status_transcode: 'selesai',
  });
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'upload',
    entity: 'media_assets',
    entityId: id,
    after: { tipe_file: kind.tipe, nama_file: originalName, ukuran_bytes: size },
  });
  return repo.detail(id);
}
