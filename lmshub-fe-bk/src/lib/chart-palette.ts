/**
 * Palet kategorikal untuk grafik.
 *
 * Slot dipakai berurutan dan tidak pernah didaur ulang: seri ke-6 bukan warna
 * baru hasil generate, melainkan tanda bahwa datanya perlu diringkas. Urutan
 * ini sudah lolos pemeriksaan keterbacaan (jarak antar-warna untuk buta warna
 * dan kontras terhadap permukaan kartu putih); jangan menyisipkan atau menukar
 * slot tanpa menjalankan ulang validasinya.
 *
 * Tiga slot terakhir kontrasnya di bawah 3:1 terhadap kartu putih, karena itu
 * setiap grafik yang memakainya wajib menampilkan nama dan angka sebagai teks
 * — bukan hanya warna. Lihat `DonutChart.vue`.
 */
export const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;

/** Warna untuk kategori pada posisi ke-`i` dari daftar tetapnya (bukan peringkat). */
export function chartColor(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

/** Satu bagian dari sebuah donut. */
export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}
