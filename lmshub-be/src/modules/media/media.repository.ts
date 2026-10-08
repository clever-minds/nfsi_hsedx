import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `media_assets` — metadata aset; berkasnya ada di object storage. */
export interface MediaAssetRow {
  id: string;
  uploader_id: string;
  file_type: string;
  file_name: string;
  path_object_storage: string;
  mime_type: string | null;
  size_bytes: string | null;
  status_transcode: string;
  hls_manifest_url: string | null;
  duration_seconds: number | null;
  checksum: string | null;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface Filters {
  file_type?: string;
  status_transcode?: string;
  q?: string;
  /** Row-level: non-admin dibatasi ke aset miliknya sendiri. */
  scopeUploaderId?: string | null;
}

export async function list(p: PageParams, f: Filters): Promise<{ rows: MediaAssetRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.file_type) add('file_type = $?', f.file_type);
  if (f.status_transcode) add('status_transcode = $?', f.status_transcode);
  if (f.scopeUploaderId) add('uploader_id = $?', f.scopeUploaderId);
  if (f.q) add('file_name ILIKE $?', `%${f.q}%`);

  const whereSql = where.join(' AND ');
  const sortCol = ['file_name', 'created_at'].includes(p.sort ?? '') ? p.sort : 'created_at';

  const rows = await query<MediaAssetRow>(
    `SELECT id, uploader_id, file_type, file_name, path_object_storage, mime_type, size_bytes,
            status_transcode, hls_manifest_url, duration_seconds, checksum, meta, created_at, updated_at
       FROM media_assets
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM media_assets WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<MediaAssetRow | null> {
  return queryOne<MediaAssetRow>(
    `SELECT id, uploader_id, file_type, file_name, path_object_storage, mime_type, size_bytes,
            status_transcode, hls_manifest_url, duration_seconds, checksum, meta, created_at, updated_at
       FROM media_assets WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function insert(data: {
  uploader_id: string;
  file_type: string;
  file_name: string;
  path_object_storage: string;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  meta: unknown;
  /** Uploaded files are browser-playable as-is; registered paths wait for a transcode step. */
  status_transcode?: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media_assets
      (uploader_id, file_type, file_name, path_object_storage, mime_type, size_bytes, status_transcode, checksum, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$9,$7,$8)
     RETURNING id`,
    [
      data.uploader_id,
      data.file_type,
      data.file_name,
      data.path_object_storage,
      data.mime_type,
      data.size_bytes,
      data.checksum,
      data.meta ? JSON.stringify(data.meta) : null,
      data.status_transcode ?? 'menunggu',
    ],
  );
  return row!;
}

/** Diperbarui worker transcode (atau manual di sini karena worker belum ada) — status pipeline video. */
export async function updateStatus(
  id: string,
  status: string,
  hlsManifestUrl: string | null,
  durasiDetik: number | null,
): Promise<void> {
  await query(
    `UPDATE media_assets
        SET status_transcode = $2,
            hls_manifest_url = COALESCE($3, hls_manifest_url),
            duration_seconds = COALESCE($4, duration_seconds)
      WHERE id = $1`,
    [id, status, hlsManifestUrl, durasiDetik],
  );
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE media_assets SET deleted_at = now() WHERE id = $1`, [id]);
}

/** Guard hapus permanen: aset yang masih dipakai lesson_contents/courses tidak boleh dihapus. */
export async function usageCount(id: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT
       (SELECT COUNT(*) FROM lesson_contents WHERE media_asset_id = $1 AND deleted_at IS NULL) +
       (SELECT COUNT(*) FROM courses WHERE (thumbnail_media_id = $1 OR promo_video_media_id = $1) AND deleted_at IS NULL)
       AS count`,
    [id],
  );
  return Number(row?.count ?? 0);
}
