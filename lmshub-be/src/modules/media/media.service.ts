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
