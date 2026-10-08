import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PASSING_SCORE,
  bolehMulaiPercobaan,
  evaluasiUjianAkhir,
  nilaiLulusEfektif,
  persenSkor,
} from '../../src/modules/certificates/completion-rules';

describe('persenSkor', () => {
  it('poin didapat ÷ total poin × 100, dua desimal', () => {
    expect(persenSkor(7, 10)).toBe(70);
    expect(persenSkor('2', '3')).toBe(66.67);
  });
  it('total poin 0 atau kosong → 0, bukan NaN/Infinity', () => {
    expect(persenSkor(5, 0)).toBe(0);
    expect(persenSkor(null, null)).toBe(0);
  });
  it('dibatasi 0..100', () => {
    expect(persenSkor(12, 10)).toBe(100);
    expect(persenSkor(-1, 10)).toBe(0);
  });
});

describe('nilaiLulusEfektif', () => {
  it('passing score quiz menang atas setting', () => {
    expect(nilaiLulusEfektif('80.00', '70')).toBe(80);
    expect(nilaiLulusEfektif(0, '70')).toBe(0);
  });
  it('quiz kosong → setting; setting kosong → bawaan', () => {
    expect(nilaiLulusEfektif(null, '65')).toBe(65);
    expect(nilaiLulusEfektif(null, '')).toBe(DEFAULT_PASSING_SCORE);
    expect(nilaiLulusEfektif(undefined, null)).toBe(DEFAULT_PASSING_SCORE);
  });
});

describe('bolehMulaiPercobaan', () => {
  const now = new Date('2026-10-05T10:00:00Z');

  it('batas tercapai → ditolak dengan alasan batas', () => {
    expect(bolehMulaiPercobaan({ attemptMaksimal: 2, jumlahPercobaan: 2, jedaMenit: 0, terakhirSelesaiAt: null, now })).toEqual({
      boleh: false,
      alasan: 'batas',
      sisa: 0,
    });
  });
  it('0 = tanpa batas', () => {
    const r = bolehMulaiPercobaan({ attemptMaksimal: 0, jumlahPercobaan: 50, jedaMenit: 0, terakhirSelesaiAt: null, now });
    expect(r).toEqual({ boleh: true, sisa: null });
  });
  it('jeda belum lewat → ditolak dan menyebut kapan boleh lagi', () => {
    const r = bolehMulaiPercobaan({
      attemptMaksimal: 3,
      jumlahPercobaan: 1,
      jedaMenit: 30,
      terakhirSelesaiAt: '2026-10-05T09:45:00Z',
      now,
    });
    expect(r.boleh).toBe(false);
    if (!r.boleh && r.alasan === 'jeda') expect(r.can_retry_at.toISOString()).toBe('2026-10-05T10:15:00.000Z');
    else throw new Error('expected cooldown');
  });
  it('jeda sudah lewat → boleh, sisa dihitung', () => {
    const r = bolehMulaiPercobaan({
      attemptMaksimal: 3,
      jumlahPercobaan: 1,
      jedaMenit: 10,
      terakhirSelesaiAt: '2026-10-05T09:45:00Z',
      now,
    });
    expect(r).toEqual({ boleh: true, sisa: 2 });
  });
  it('batas didahulukan atas jeda', () => {
    const r = bolehMulaiPercobaan({ attemptMaksimal: 1, jumlahPercobaan: 1, jedaMenit: 60, terakhirSelesaiAt: now, now });
    expect(r).toMatchObject({ boleh: false, alasan: 'batas' });
  });
});

describe('evaluasiUjianAkhir', () => {
  const quiz = { id: 'q1', title: 'Final', passing_score: '75', total_points: '20' };

  it('course tanpa ujian akhir tetap lulus (kompatibel mundur)', () => {
    expect(evaluasiUjianAkhir({ quiz: null, skorTerbaik: null, settingPassing: '70' })).toMatchObject({ ada: false, lulus: true });
  });
  it('belum pernah dinilai → belum lulus', () => {
    expect(evaluasiUjianAkhir({ quiz, skorTerbaik: null, settingPassing: '' })).toMatchObject({
      ada: true,
      lulus: false,
      skor_terbaik_persen: null,
      passing_score_val: 75,
    });
  });
  it('tepat di nilai lulus → lulus; di bawahnya → tidak', () => {
    expect(evaluasiUjianAkhir({ quiz, skorTerbaik: 15, settingPassing: '' }).lulus).toBe(true);
    expect(evaluasiUjianAkhir({ quiz, skorTerbaik: 14, settingPassing: '' }).lulus).toBe(false);
  });
  it('passing score quiz kosong memakai setting global', () => {
    const r = evaluasiUjianAkhir({ quiz: { ...quiz, passing_score: null }, skorTerbaik: 12, settingPassing: '60' });
    expect(r).toMatchObject({ passing_score_val: 60, skor_terbaik_persen: 60, lulus: true });
  });
});
