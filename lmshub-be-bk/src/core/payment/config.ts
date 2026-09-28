import { query } from '../db/pool';
import { env } from '../config/env';

/**
 * Where payment credentials come from.
 *
 * Settings first, environment second. A buyer configures gateways on the
 * Settings screen; an installation that still has everything in `.env` keeps
 * working untouched, which matters because upgrading must never silently take a
 * live store's checkout offline.
 *
 * Values are cached because `isConfigured()` is called synchronously while
 * building the checkout options. `ensurePaymentSettings()` fills the cache and
 * is awaited at the few entry points that need it; saving a setting clears it.
 */

/** What the API returns in place of a stored secret. Never a real credential. */
const MASK = '••••••••';

let cache: Map<string, string> | null = null;

export async function loadPaymentSettings(): Promise<void> {
  const rows = await query<{ key: string; nilai: string | null }>(
    `SELECT key, nilai FROM settings WHERE grup LIKE 'payment%' AND deleted_at IS NULL`,
  );
  cache = new Map(rows.map((r) => [r.key, (r.nilai ?? '').trim()]));
}

export async function ensurePaymentSettings(): Promise<void> {
  if (!cache) await loadPaymentSettings();
}

/** Called whenever a setting is saved, so the next checkout uses the new value. */
export function invalidatePaymentSettings(): void {
  cache = null;
}

function setting(key: string): string {
  const value = cache?.get(key) ?? '';
  // A masked value means the secret was never entered, or a client posted the
  // placeholder back. Either way it is not a credential.
  return value === MASK ? '' : value;
}

/** Credential from Settings, falling back to the matching environment variable. */
export function credential(settingKey: string, envKey: keyof typeof env): string {
  return setting(settingKey) || String(env[envKey] ?? '');
}

/** Boolean setting, falling back to an environment flag. */
export function toggle(settingKey: string, envValue?: boolean): boolean {
  const raw = setting(settingKey);
  if (raw) return raw === 'true' || raw === '1';
  return envValue ?? false;
}

/**
 * Is this gateway offered at checkout?
 *
 * Credentials held in Settings are governed by the screen's tick box. Credentials
 * that come from `.env` are treated as enabled without one — that is how the
 * gateway behaved before the screen existed, and an upgrade that quietly
 * unticked a working gateway would take a live checkout down.
 */
export function gatewayEnabled(id: string, envConfigured: boolean): boolean {
  if (toggle(`payment.${id}.enabled`)) return true;
  return envConfigured && !hasSettingCredentials(id);
}

/**
 * Has anything been entered on the Settings screen for this gateway?
 *
 * Checked across the whole group rather than by guessing a key name — the
 * gateways disagree on what the secret is called (`secret_key`, `key_secret`,
 * `client_secret`, `server_key`, `api_key`), and a guess that misses would make
 * a configured gateway look unconfigured.
 */
export function hasSettingCredentials(id: string): boolean {
  const prefix = `payment.${id}.`;
  for (const [key, value] of cache ?? []) {
    if (!key.startsWith(prefix)) continue;
    if (key.endsWith('.enabled')) continue;
    if (value && value !== MASK && value !== 'false') return true;
  }
  return false;
}

/** Manual bank transfer has no credentials — only an on/off switch. */
export function manualTransferEnabled(): boolean {
  return toggle('payment.manual.enabled', true);
}
