/**
 * Aturan kelulusan yang bisa diuji tanpa basis data.
 *
 * Dipakai bersama by modul assessment (boleh start percobaan baru?) dan modul
 * certificate (sudah lulus exam akhir?), supaya keduanya membaca rule yang
 * sama persis.
 */

/** grade lulus bawaan bila quiz no mengisi `passing_score` dan setting kosong. */
export const DEFAULT_PASSING_SCORE = 70;

/**
 * Skor dalam persen: points didapat ÷ total points quiz × 100, dua desimal.
 *
 * Poin per soal adalah bobotnya (`questions.points`, bisa ditimpa
 * `quiz_questions.points_override`), jadi tanpa bobot khusus ini sama dengan
 * answer benar ÷ amount soal.
 */
export function persenSkor(score: number | string | null | undefined, totalPoin: number | string | null | undefined): number {
  const s = Number(score ?? 0);
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
  | { boleh: false; reason: 'batas'; sisa: 0 }
  | { boleh: false; reason: 'jeda'; sisa: number | null; can_retry_at: Date };

/**
 * Bolehkah student memulai percobaan baru?
 *
 * - `attemptMaksimal` 0 = tanpa batas.
 * - `jedaMenit` dihitung from percobaan terakhir yang SUDAH dikumpulkan; percobaan
 *   yang masih berjalan no memulai jeda.
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
  if (sisa === 0) return { boleh: false, reason: 'batas', sisa: 0 };

  if (opts.jedaMenit > 0 && opts.terakhirSelesaiAt) {
    const bolehLagi = new Date(new Date(opts.terakhirSelesaiAt).getTime() + opts.jedaMenit * 60_000);
    if (bolehLagi > now) return { boleh: false, reason: 'jeda', sisa, can_retry_at: bolehLagi };
  }
  return { boleh: true, sisa };
}

export interface StatusUjianAkhir {
  /** Course punya exam akhir yang active. */
  ada: boolean;
  quiz_id: string | null;
  title: string | null;
  passing_score_val: number | null;
  /** Persen terbaik from percobaan yang sudah dinilai. */
  score_terbaik_persen: number | null;
  lulus: boolean;
}

/**
 * Evaluasi exam akhir from data mentah. Tanpa exam (atau ujiannya sudah
 * dinonaktifkan/dihapus) dianggap lulus — course lama tetap memberi certificate
 * seperti previous.
 */
export function evaluasiUjianAkhir(input: {
  quiz: { id: string; title: string; passing_score: string | number | null; total_pointsts: string | number } | null;
  scoreTerbaik: string | number | null;
  settingPassing: string | null;
}): StatusUjianAkhir {
  if (!input.quiz) {
    return { ada: false, quiz_id: null, title: null, passing_score_val: null, score_terbaik_persen: null, lulus: true };
  }
  const nilaiLulus = nilaiLulusEfektif(input.quiz.passing_score, input.settingPassing);
  const terbaik = input.scoreTerbaik === null || input.scoreTerbaik === undefined ? null : persenSkor(input.scoreTerbaik, input.quiz.total_pointsts);
  return {
    ada: true,
    quiz_id: input.quiz.id,
    title: input.quiz.title,
    passing_score_val: nilaiLulus,
    score_terbaik_persen: terbaik,
    lulus: terbaik !== null && terbaik >= nilaiLulus,
  };
}
