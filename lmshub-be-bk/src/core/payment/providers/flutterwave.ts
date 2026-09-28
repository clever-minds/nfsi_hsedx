import crypto from 'crypto';
import { gatewayFetch, header } from '../http';
import { amountMatches } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';

/**
 * Flutterwave Standard checkout — pan-African cards, mobile money, USSD.
 *
 * Flutterwave authenticates webhooks with a shared secret compared verbatim,
 * which is weaker than an HMAC over the body. We therefore re-verify every
 * successful charge against the API before settling anything.
 */

const API = 'https://api.flutterwave.com/v3';

interface PaymentResponse {
  status: string;
  data: { link: string };
}

interface FlutterwaveWebhook {
  event?: string;
  data?: Record<string, unknown>;
}

interface VerifyResponse {
  status: string;
  data?: { status?: string; tx_ref?: string; amount?: number; currency?: string };
}

export const flutterwaveProvider: PaymentProvider = {
  id: 'flutterwave',
  label: 'Flutterwave',

  isConfigured() {
    return !!credential('payment.flutterwave.secret_key', 'FLUTTERWAVE_SECRET_KEY');
  },

  publicConfig() {
    return { public_key: credential('payment.flutterwave.public_key', 'FLUTTERWAVE_PUBLIC_KEY') || null };
  },

  supportedCurrencies() {
    return null; // NGN, GHS, KES, UGX, TZS, ZAR, USD, EUR, GBP — account dependent.
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const res = await gatewayFetch<PaymentResponse>({
      provider: 'flutterwave',
      url: `${API}/payments`,
      headers: { Authorization: `Bearer ${credential('payment.flutterwave.secret_key', 'FLUTTERWAVE_SECRET_KEY')}` },
      body: {
        tx_ref: p.paymentId,
        amount: p.amount,
        currency: p.currency.toUpperCase(),
        redirect_url: p.returnUrl,
        customer: {
          email: p.customer.email ?? undefined,
          name: p.customer.name ?? undefined,
          phonenumber: p.customer.phone ?? undefined,
        },
        customizations: { title: p.description.slice(0, 100) },
      },
    });

    if (res.status !== 'success') throw new Error('Flutterwave refused to create the payment link');
    return { redirectUrl: res.data.link, gatewayRef: p.paymentId };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!credential('payment.flutterwave.webhook_hash', 'FLUTTERWAVE_WEBHOOK_HASH')) throw new Error('FLUTTERWAVE_WEBHOOK_HASH is not set');

    const received = header(req.headers, 'verif-hash');
    const a = Buffer.from(credential('payment.flutterwave.webhook_hash', 'FLUTTERWAVE_WEBHOOK_HASH'));
    const b = Buffer.from(received);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Flutterwave webhook hash mismatch');
    }

    const event = req.body as FlutterwaveWebhook;
    if (event.event !== 'charge.completed') return null;

    const data = event.data ?? {};
    const reference = (data.tx_ref as string) ?? '';
    if (!reference) return null;

    if (data.status !== 'successful') {
      return { reference, outcome: 'failed', note: `Flutterwave ${String(data.status ?? 'unknown')}` };
    }

    // The shared hash proves the sender, not the contents — confirm with the API.
    const transactionId = data.id;
    if (transactionId === undefined || transactionId === null) return null;

    const verified = await gatewayFetch<VerifyResponse>({
      provider: 'flutterwave',
      url: `${API}/transactions/${encodeURIComponent(String(transactionId))}/verify`,
      method: 'GET',
      headers: { Authorization: `Bearer ${credential('payment.flutterwave.secret_key', 'FLUTTERWAVE_SECRET_KEY')}` },
    });

    const confirmed = verified.data;
    if (verified.status !== 'success' || confirmed?.status !== 'successful') {
      return { reference, outcome: 'failed', note: 'Flutterwave verification did not confirm the charge' };
    }
    if (confirmed.tx_ref !== reference) {
      throw new Error('Flutterwave verification returned a different tx_ref');
    }

    // Guard against a tampered webhook body claiming a larger payment.
    const charged = Number(confirmed.amount ?? 0);
    const currency = String(confirmed.currency ?? '');
    const claimed = Number(data.amount ?? 0);
    if (!amountMatches(claimed, charged, currency)) {
      throw new Error('Flutterwave amount does not match the verified transaction');
    }

    return { reference, outcome: 'settlement', note: `Flutterwave ${String(transactionId)}` };
  },
};
