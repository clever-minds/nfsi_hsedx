/**
 * Kenali jenis gambar dari byte awalnya, bukan dari `Content-Type` kiriman klien.
 *
 * Tipe yang diklaim klien hanyalah label. Tanpa pemeriksaan ini, berkas HTML
 * atau skrip bisa diunggah sebagai "image/png" dan disimpan di `uploads/`.
 * Hanya tiga format yang dikenali — persis yang diterima unggahan gambar.
 */
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const IMAGE_EXT: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function sniffImageMime(head: Buffer): ImageMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
