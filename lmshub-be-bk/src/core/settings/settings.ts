import { query } from '../db/pool';

interface SettingRow {
  key: string;
  nilai: string | null;
}

// Cache sederhana (TTL 30 dtk) agar tidak query tiap kirim email.
let cache: Map<string, string | null> | null = null;
let cacheAt = 0;
const TTL_MS = 30_000;

async function loadAll(): Promise<Map<string, string | null>> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  const rows = await query<SettingRow>(`SELECT key, nilai FROM settings WHERE deleted_at IS NULL`);
  cache = new Map(rows.map((r) => [r.key, r.nilai]));
  cacheAt = now;
  return cache;
}

/** Invalidasi cache setelah setting diubah (dipanggil modul settings). */
export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const all = await loadAll();
  const v = all.get(key);
  return v == null || v === '' ? fallback : v;
}

export async function getSettingBool(key: string, fallback = false): Promise<boolean> {
  const v = (await getSetting(key, fallback ? 'true' : 'false')).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export async function getSettingInt(key: string, fallback = 0): Promise<number> {
  const n = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

/** Ambil beberapa setting sekaligus (map key→nilai). */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const all = await loadAll();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = all.get(k) ?? '';
  return out;
}
