/**
 * Aturan kelulusan yang bisa diuji tanpa basis data.
 *
 * Dipakai bersama oleh modul assessment (boleh mulai percobaan baru?) dan modul
 * certificate (sudah lulus ujian akhir?), supaya keduanya membaca aturan yang
 * sama persis.
 */

/** Nilai lulus bawaan bila quiz tidak mengisi `passing_score` dan setting kosong. */
export const DEFAULT_PASSING_SCORE = 70;

/**
 * Skor dalam persen: poin didapat ÷ total poin quiz × 100, dua desimal.
 *
 * Poin per soal adalah bobotnya (`questions.poin`, bisa ditimpa
 * `quiz_questions.poin_override`), jadi tanpa bobot khusus ini sama dengan
 * jawaban benar ÷ jumlah soal.
 */
export function persenSkor(skor: number | string | null | undefined, totalPoin: number | string | null | undefined): number {
  const s = Number(skor ?? 0);
  const t = Number(totalPoin ?? 0);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (s / t) * 100)) * 100) / 100;
}

/** `passing_score` quiz menang; bila kosong, setting global; bila kosong juga, 70. */
export function nilaiLulusEfektif(quizPassing: number | string | null | undefined, settingPassing: string | null | undefined): number {
  if (quizPassing !== null && quizPassing !== undefined && quizPassing !== '') {
    const n = Number(quizPassing);
    if (Number.isFinite(n)) return n;
  }
  const s = Number(settingPassing);
  return settingPassing !== null && settingPassing !== undefined && settingPassing !== '' && Number.isFinite(s)
    ? s
    : DEFAULT_PASSING_SCORE;
}

export type KeputusanPercobaan =
  | { boleh: true; sisa: number | null }
  | { boleh: false; alasan: 'batas'; sisa: 0 }
  | { boleh: false; alasan: 'jeda'; sisa: number | null; can_retry_at: Date };

/**
 * Bolehkah student memulai percobaan baru?
 *
 * - `attemptMaksimal` 0 = tanpa batas.
 * - `jedaMenit` dihitung dari percobaan terakhir yang SUDAH dikumpulkan; percobaan
 *   yang masih berjalan tidak memulai jeda.
 * - `sisa` = percobaan yang masih tersedia (null bila tanpa batas).
 */
export function bolehMulaiPercobaan(opts: {
  attemptMaksimal: number;
  jumlahPercobaan: number;
  jedaMenit: number;
  terakhirSelesaiAt: Date | string | null;
  now?: Date;
}): KeputusanPercobaan {
  const now = opts.now ?? new Date();
  const tanpaBatas = opts.attemptMaksimal <= 0;
  const sisa = tanpaBatas ? null : Math.max(0, opts.attemptMaksimal - opts.jumlahPercobaan);
  if (sisa === 0) return { boleh: false, alasan: 'batas', sisa: 0 };

  if (opts.jedaMenit > 0 && opts.terakhirSelesaiAt) {
    const bolehLagi = new Date(new Date(opts.terakhirSelesaiAt).getTime() + opts.jedaMenit * 60_000);
    if (bolehLagi > now) return { boleh: false, alasan: 'jeda', sisa, can_retry_at: bolehLagi };
  }
  return { boleh: true, sisa };
}

export interface StatusUjianAkhir {
  /** Course punya ujian akhir yang aktif. */
  ada: boolean;
  quiz_id: string | null;
  title: string | null;
  passing_score_val: number | null;
  /** Persen terbaik dari percobaan yang sudah dinilai. */
  skor_terbaik_persen: number | null;
  lulus: boolean;
}

/**
 * Evaluasi ujian akhir dari data mentah. Tanpa ujian (atau ujiannya sudah
 * dinonaktifkan/dihapus) dianggap lulus — course lama tetap memberi certificate
 * seperti sebelumnya.
 */
export function evaluasiUjianAkhir(input: {
  quiz: { id: string; title: string; passing_score: string | number | null; total_points: string | number } | null;
  skorTerbaik: string | number | null;
  settingPassing: string | null;
}): StatusUjianAkhir {
  if (!input.quiz) {
    return { ada: false, quiz_id: null, title: null, passing_score_val: null, skor_terbaik_persen: null, lulus: true };
  }
  const nilaiLulus = nilaiLulusEfektif(input.quiz.passing_score, input.settingPassing);
  const terbaik = input.skorTerbaik === null || input.skorTerbaik === undefined ? null : persenSkor(input.skorTerbaik, input.quiz.total_points);
  return {
    ada: true,
    quiz_id: input.quiz.id,
    title: input.quiz.title,
    passing_score_val: nilaiLulus,
    skor_terbaik_persen: terbaik,
    lulus: terbaik !== null && terbaik >= nilaiLulus,
  };
}
