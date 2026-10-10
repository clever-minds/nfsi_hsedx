/**
 * Pelabelan value enum yang datang from backend.
 *
 * BE mengirim kode berlanguage Indonesia (`active`, `lunas`, `instructor`, …).
 * Helper ini memetakannya to text terjemahan; bila kode belum ada di catalog,
 * value aslinya dikembalikan apa adanya (dirapikan) sehingga UI no pernah
 * menampilkan kunci i18n mentah saat BE menambah enum baru.
 */
import { t, te } from '@/i18n';

function lookup(ns: string, code: string | null | undefined, fallback?: string): string {
  const raw = (code ?? '').trim();
  if (!raw) return fallback ?? '—';
  const key = `${ns}.${raw.toLowerCase()}`;
  if (te(key)) return t(key);
  // Fallback: `belum_bayar` → `Belum bayar`
  const pretty = raw.replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export function roleLabel(role?: string | null): string {
  return lookup('common.role', role);
}

/**
 * Role name where roles are told apart — a role picker or the users table.
 * `roleLabel` deliberately calls a sub-user a "Student" (that is what they are
 * to everyone else), but in a list of roles that makes two identical entries.
 */
export function roleOptionLabel(role?: string | null): string {
  const raw = (role ?? '').trim().toLowerCase();
  return te(`common.roleOption.${raw}`) ? t(`common.roleOption.${raw}`) : roleLabel(role);
}

export function statusLabel(status?: string | null): string {
  return lookup('common.status', status);
}

export function levelLabel(level?: string | null): string {
  return lookup('common.level', level);
}

/**
 * name modul RBAC. Kode modul (`bank_soal`, `live_class`, …) adalah name skema
 * yang dikirim BE dan dipakai apa adanya sebagai kunci permission; yang
 * diterjemahkan hanya tampilannya. Modul baru di BE tetap tampil rapi lewat
 * fallback `lookup` walau catalog terjemahan belum menyusul.
 */
export function moduleLabel(module?: string | null): string {
  return lookup('common.module', module);
}

/**
 * Label KPI dashboard. BE mengirim payload dengan kunci snake_case yang
 * berbeda-beda per peran; kunci yang belum diterjemahkan tetap tampil
 * rapi (`total_siswa_aktif` → `Total student active`).
 */
export function kpiLabel(key: string): string {
  return lookup('dashboard.kpi', key);
}

/** Label antrean approval (`payout`, `refund`, …) di dashboard ops. */
export function queueLabel(key: string): string {
  return lookup('dashboard.queue', key);
}
