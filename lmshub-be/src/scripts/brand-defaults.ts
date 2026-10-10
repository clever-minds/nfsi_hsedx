import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { queryOne, pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

/**
 * Pasang logo & ikon bawaan produk sehingga instalasi baru sudah bermerek sejak
 * layar login pertama, bukan menampilkan tempat kosong until seseorang
 * mengunggah sesuatu.
 *
 * Berkas source ikut di repo (`assets/branding/`), lalu **disalin** to
 * `uploads/branding/` — direktori yang sama yang dipakai unggahan lewat menu
 * settings, dan yang disajikan di `/uploads/...`. Menunjuk setting langsung to
 * `assets/` akan bekerja di dev lalu failed di produksi, karena hanya `uploads/`
 * yang diekspos by express.static & proxy Nginx.
 *
 * **no pernah menimpa merek yang sudah dipasang.** Setting hanya diisi bila
 * nilainya kosong, jadi menjalankan ulang seed di sistem yang sudah berjalan
 * no akan mengembalikan logo pembeli to logo bawaan.
 */

const SRC_DIR = path.resolve(process.cwd(), 'assets', 'branding');
const DEST_DIR = path.resolve(process.cwd(), 'uploads', 'branding');

const ASSETS = [
  { key: 'brand.logo_url', file: 'logo.png', label: 'Logo' },
  { key: 'brand.icon_url', file: 'icon.png', label: 'Icon' },
] as const;

export async function installDefaultBrandAssets(): Promise<void> {
  for (const asset of ASSETS) {
    const row = await queryOne<{ id: string; value: string | null }>(
      `SELECT id, value FROM settings WHERE key = $1 AND deleted_at IS NULL`,
      [asset.key],
    );

    if (!row) {
      // Migrasi 0160 yang membuat baris ini; tanpa migrasi tak ada yang diisi.
      logger.warn(`${asset.key} does not exist yet — run \`npm run migrate:up\` first.`);
      continue;
    }

    if (row.value && row.value.trim() !== '') {
      logger.info(`${asset.label} is already set (${row.value}) — left alone.`);
      continue;
    }

    // name tetap, bukan bercap time: aset bawaan hanya ditulis sekali dan no
    // perlu menembus cache browser seperti unggahan yang menggantikan aset lama.
    const filename = `default-${asset.file}`;
    try {
      await mkdir(DEST_DIR, { recursive: true });
      await copyFile(path.join(SRC_DIR, asset.file), path.join(DEST_DIR, filename));
    } catch (err) {
      // Merek bawaan bukan reason untuk menggagalkan seed: akun super admin jauh
      // lebih penting, dan logo bisa diunggah lewat menu settings.
      logger.warn({ err }, `The default ${asset.label} could not be copied — skipped.`);
      continue;
    }

    await pool.query(`UPDATE settings SET value = $1, updated_at = now() WHERE id = $2`, [
      `/uploads/branding/${filename}`,
      row.id,
    ]);
    logger.info(`✅ Default ${asset.label} installed: /uploads/branding/${filename}`);
  }
}
