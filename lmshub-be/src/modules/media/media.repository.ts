import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `media_assets` — metadata aset; berkasnya ada di object storage. */
export interface MediaAssetRow {
  id: string;
  uploader_id: string;
  tipe_file: string;
  nama_file: string;
  path_object_storage: string;
  mime_type: string | null;
  ukuran_bytes: string | null;
  status_transcode: string;
  hls_manifest_url: string | null;
  durasi_detik: number | null;
  checksum: string | null;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface Filters {
  tipe_file?: string;
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
  if (f.tipe_file) add('tipe_file = $?', f.tipe_file);
  if (f.status_transcode) add('status_transcode = $?', f.status_transcode);
  if (f.scopeUploaderId) add('uploader_id = $?', f.scopeUploaderId);
  if (f.q) add('nama_file ILIKE $?', `%${f.q}%`);

  const whereSql = where.join(' AND ');
  const sortCol = ['nama_file', 'created_at'].includes(p.sort ?? '') ? p.sort : 'created_at';

  const rows = await query<MediaAssetRow>(
    `SELECT id, uploader_id, tipe_file, nama_file, path_object_storage, mime_type, ukuran_bytes,
            status_transcode, hls_manifest_url, durasi_detik, checksum, meta, created_at, updated_at
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
    `SELECT id, uploader_id, tipe_file, nama_file, path_object_storage, mime_type, ukuran_bytes,
            status_transcode, hls_manifest_url, durasi_detik, checksum, meta, created_at, updated_at
       FROM media_assets WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function insert(data: {
  uploader_id: string;
  tipe_file: string;
  nama_file: string;
  path_object_storage: string;
  mime_type: string | null;
  ukuran_bytes: number | null;
  checksum: string | null;
  meta: unknown;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media_assets
      (uploader_id, tipe_file, nama_file, path_object_storage, mime_type, ukuran_bytes, status_transcode, checksum, meta)
     VALUES ($1,$2,$3,$4,$5,$6,'menunggu',$7,$8)
     RETURNING id`,
    [
      data.uploader_id,
      data.tipe_file,
      data.nama_file,
      data.path_object_storage,
      data.mime_type,
      data.ukuran_bytes,
      data.checksum,
      data.meta ? JSON.stringify(data.meta) : null,
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
            durasi_detik = COALESCE($4, durasi_detik)
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
