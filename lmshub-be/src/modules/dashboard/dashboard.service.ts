import { AuthContext } from '../../core/rbac/types';
import * as repo from './dashboard.repository';

export async function siswa(actor: AuthContext) {
  const [kpi, reminder_mendatang, jadwal_live_terdekat] = await Promise.all([
    repo.siswaKpi(actor.userId),
    repo.siswaReminderMendatang(actor.userId),
    repo.siswaJadwalLiveTerdekat(actor.userId),
  ]);
  return { ...kpi, reminder_mendatang, jadwal_live_terdekat };
}

export async function instruktur(actor: AuthContext) {
  const [kpi, kursus_saya, enrollment_terbaru, jadwal_live_terdekat] = await Promise.all([
    repo.instrukturKpi(actor.userId),
    repo.instrukturKursusSaya(actor.userId),
    repo.instrukturEnrollmentTerbaru(actor.userId),
    repo.instrukturJadwalLiveTerdekat(actor.userId),
  ]);
  return { ...kpi, kursus_saya, enrollment_terbaru, jadwal_live_terdekat };
}

/**
 * Blok analitik yang sama untuk semua dashboard operasional (admin & direktur):
 * dua sebaran untuk donut, papan peringkat instruktur, dan order terbaru.
 */
async function opsAnalitik() {
  const [komposisi_order, komposisi_enrollment, komposisi_peran, top_instruktur, transaksi_terbaru] =
    await Promise.all([
      repo.komposisiOrder(),
      repo.komposisiEnrollment(),
      repo.komposisiPeran(),
      repo.topInstruktur(),
      repo.transaksiTerbaru(),
    ]);
  return { komposisi_order, komposisi_enrollment, komposisi_peran, top_instruktur, transaksi_terbaru };
}

export async function admin(_actor: AuthContext) {
  const [kpi, ringkasan, tren_enrollment_7hari, kursus_terpopuler, pendaftaran_terbaru, analitik] = await Promise.all([
    repo.adminKpi(),
    repo.globalRingkasan(),
    repo.trenEnrollment7Hari(),
    repo.kursusTerpopuler(),
    repo.pendaftaranTerbaruGlobal(),
    opsAnalitik(),
  ]);
  return { ...kpi, ...ringkasan, tren_enrollment_7hari, kursus_terpopuler, pendaftaran_terbaru, ...analitik };
}

export async function direktur(_actor: AuthContext) {
  const [kpi, ringkasan, antrean_payout, tren_enrollment_7hari, kursus_terpopuler, pendaftaran_terbaru, analitik] =
    await Promise.all([
    repo.direkturKpi(),
      // Dua angka ini melengkapi KPI direktur jadi dua baris penuh; tanpanya
      // barisan kartu berhenti di tengah.
      repo.globalRingkasan(),
    repo.direkturAntreanPayout(),
    repo.trenEnrollment7Hari(),
    repo.kursusTerpopuler(),
    repo.pendaftaranTerbaruGlobal(),
      opsAnalitik(),
  ]);
  return {
    ...kpi,
    total_pengguna_aktif: ringkasan.total_pengguna_aktif,
    total_kursus_terbit: ringkasan.total_kursus_terbit,
    antrean_payout,
    tren_enrollment_7hari,
    kursus_terpopuler,
    pendaftaran_terbaru,
    ...analitik,
  };
}

export async function ketua(_actor: AuthContext) {
  return repo.ketuaKpi();
}

export async function pembina(_actor: AuthContext) {
  const [kpi, audit_terbaru] = await Promise.all([repo.pembinaKpi(), repo.pembinaAuditTerbaru()]);
  return { ...kpi, audit_terbaru };
}

export async function marketing(actor: AuthContext) {
  return repo.marketingKpi(actor.userId);
}
