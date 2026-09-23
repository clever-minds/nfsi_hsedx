import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { queryOne, pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

/**
 * Pasang logo & ikon bawaan produk sehingga instalasi baru sudah bermerek sejak
 * layar login pertama, bukan menampilkan tempat kosong sampai seseorang
 * mengunggah sesuatu.
 *
 * Berkas sumber ikut di repo (`assets/branding/`), lalu **disalin** ke
 * `uploads/branding/` — direktori yang sama yang dipakai unggahan lewat menu
 * Pengaturan, dan yang disajikan di `/uploads/...`. Menunjuk setting langsung ke
 * `assets/` akan bekerja di dev lalu gagal di produksi, karena hanya `uploads/`
 * yang diekspos oleh express.static & proxy Nginx.
 *
 * **Tidak pernah menimpa merek yang sudah dipasang.** Setting hanya diisi bila
 * nilainya kosong, jadi menjalankan ulang seed di sistem yang sudah berjalan
 * tidak akan mengembalikan logo pembeli ke logo bawaan.
 */

const SRC_DIR = path.resolve(process.cwd(), 'assets', 'branding');
const DEST_DIR = path.resolve(process.cwd(), 'uploads', 'branding');

const ASSETS = [
  { key: 'brand.logo_url', file: 'logo.png', label: 'Logo' },
  { key: 'brand.icon_url', file: 'icon.png', label: 'Icon' },
] as const;

export async function installDefaultBrandAssets(): Promise<void> {
  for (const asset of ASSETS) {
    const row = await queryOne<{ id: string; nilai: string | null }>(
      `SELECT id, nilai FROM settings WHERE key = $1 AND deleted_at IS NULL`,
      [asset.key],
    );

    if (!row) {
      // Migrasi 0160 yang membuat baris ini; tanpa migrasi tak ada yang diisi.
      logger.warn(`${asset.key} does not exist yet — run \`npm run migrate:up\` first.`);
      continue;
    }

    if (row.nilai && row.nilai.trim() !== '') {
      logger.info(`${asset.label} is already set (${row.nilai}) — left alone.`);
      continue;
    }

    // Nama tetap, bukan bercap waktu: aset bawaan hanya ditulis sekali dan tidak
    // perlu menembus cache browser seperti unggahan yang menggantikan aset lama.
    const filename = `default-${asset.file}`;
    try {
      await mkdir(DEST_DIR, { recursive: true });
      await copyFile(path.join(SRC_DIR, asset.file), path.join(DEST_DIR, filename));
    } catch (err) {
      // Merek bawaan bukan alasan untuk menggagalkan seed: akun super admin jauh
      // lebih penting, dan logo bisa diunggah lewat menu Pengaturan.
      logger.warn({ err }, `The default ${asset.label} could not be copied — skipped.`);
      continue;
    }

    await pool.query(`UPDATE settings SET nilai = $1, updated_at = now() WHERE id = $2`, [
      `/uploads/branding/${filename}`,
      row.id,
    ]);
    logger.info(`✅ Default ${asset.label} installed: /uploads/branding/${filename}`);
  }
}
