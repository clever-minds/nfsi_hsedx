import { apiGet } from './api';

/**
 * Checkout gateway helpers.
 *
 * Two shapes of gateway exist. Most are hosted: the backend returns a URL and
 * the browser leaves the site to pay. Midtrans is the exception — its Snap
 * popup keeps the buyer on the page, so it keeps its own path here.
 *
 * Either way the order is settled by the gateway's webhook, never by anything
 * that happens in this file. A buyer who closes the tab mid-payment still gets
 * their course once the webhook lands.
 */

export interface BankAccountOption {
  id: string;
  bank: string;
  nomor_rekening: string;
  atas_nama: string;
  cabang?: string | null;
  is_utama?: boolean;
}

export interface GatewayOption {
  id: string;
  label: string;
  config: Record<string, unknown>;
}

export interface PaymentConfig {
  currency: string;
  providers: GatewayOption[];
  bank_accounts: BankAccountOption[];
  bank_transfer: Omit<BankAccountOption, 'id'> | null;
  /** Kompatibilitas: klien lama membaca field Midtrans di akar objek. */
  provider: string | null;
  configured: boolean;
  client_key: string | null;
  is_production: boolean;
}

let cached: PaymentConfig | null = null;

export async function getPaymentConfig(force = false): Promise<PaymentConfig> {
  if (cached && !force) return cached;
  cached = await apiGet<PaymentConfig>('/orders/payment-config');
  return cached;
}

/** Buang cache — dipanggil setelah admin mengubah pengaturan pembayaran. */
export function invalidatePaymentConfig(): void {
  cached = null;
}

// ── Midtrans Snap (popup, tetap di halaman) ───────────────────────────────

let snapLoaded = false;

async function ensureSnap(clientKey: string, isProduction: boolean): Promise<void> {
  if (snapLoaded) return;
  const src = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-client-key', clientKey);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Snap.js'));
    document.head.appendChild(s);
  });
  snapLoaded = true;
}

export type SnapResult = 'success' | 'pending' | 'error' | 'close';

interface SnapWindow extends Window {
  snap?: {
    pay(
      token: string,
      cb: {
        onSuccess?: (r: unknown) => void;
        onPending?: (r: unknown) => void;
        onError?: (r: unknown) => void;
        onClose?: () => void;
      },
    ): void;
  };
}

/** Buka popup Snap untuk token, resolve dengan hasil interaksi pembeli. */
export async function paySnap(token: string): Promise<SnapResult> {
  const cfg = await getPaymentConfig();
  const clientKey = (cfg.providers.find((p) => p.id === 'midtrans')?.config.client_key as string) ?? cfg.client_key;
  if (!clientKey) throw new Error('The Midtrans client key is not configured');

  const isProduction =
    (cfg.providers.find((p) => p.id === 'midtrans')?.config.is_production as boolean) ?? cfg.is_production;

  await ensureSnap(clientKey, isProduction);
  const w = window as SnapWindow;
  if (!w.snap) throw new Error('Snap is not ready');

  return new Promise<SnapResult>((resolve) => {
    w.snap!.pay(token, {
      onSuccess: () => resolve('success'),
      onPending: () => resolve('pending'),
      onError: () => resolve('error'),
      onClose: () => resolve('close'),
    });
  });
}
