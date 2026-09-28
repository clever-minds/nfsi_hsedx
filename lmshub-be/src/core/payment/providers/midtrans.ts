import crypto from 'crypto';
import { env } from '../../config/env';
import { basicAuth, gatewayFetch } from '../http';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential, toggle } from '../config';

/**
 * Midtrans Snap (Indonesia).
 *
 * Uses the Snap REST endpoint directly instead of `midtrans-client`, so that
 * all seven gateways share one HTTP path and the package ships one fewer
 * dependency for buyers to install and audit.
 */

function api(): string {
  return toggle('payment.midtrans.production', env.MIDTRANS_IS_PRODUCTION)
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
}

interface SnapResponse {
  token: string;
  redirect_url: string;
}

export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  transaction_id?: string;
  payment_type?: string;
}

export const midtransProvider: PaymentProvider = {
  id: 'midtrans',
  label: 'Midtrans',

  isConfigured() {
    return !!credential('payment.midtrans.server_key', 'MIDTRANS_SERVER_KEY');
  },

  publicConfig() {
    return { client_key: credential('payment.midtrans.client_key', 'MIDTRANS_CLIENT_KEY') || null, is_production: toggle('payment.midtrans.production', env.MIDTRANS_IS_PRODUCTION) };
  },

  supportedCurrencies() {
    return ['IDR'];
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const res = await gatewayFetch<SnapResponse>({
      provider: 'midtrans',
      url: api(),
      headers: { Authorization: basicAuth(credential('payment.midtrans.server_key', 'MIDTRANS_SERVER_KEY')) },
      body: {
        // Midtrans rejects fractional rupiah.
        transaction_details: { order_id: p.paymentId, gross_amount: Math.round(p.amount) },
        credit_card: { secure: true },
        customer_details: {
          first_name: p.customer.name ?? undefined,
          email: p.customer.email ?? undefined,
          phone: p.customer.phone ?? undefined,
        },
        callbacks: { finish: p.returnUrl },
      },
    });

    // The Snap token lets the frontend open the popup instead of redirecting.
    return { redirectUrl: res.redirect_url, gatewayRef: p.paymentId, meta: { snap_token: res.token } };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!credential('payment.midtrans.server_key', 'MIDTRANS_SERVER_KEY')) throw new Error('MIDTRANS_SERVER_KEY is not set');

    const n = req.body as MidtransNotification;
    if (!n?.order_id) return null;
    if (!verifySignature(n)) throw new Error('Midtrans webhook signature mismatch');

    const trace = `Midtrans ${n.payment_type ?? ''} ${n.transaction_id ?? ''}`.trim();
    const status = n.transaction_status;

    if (status === 'capture') {
      return n.fraud_status === 'accept'
        ? { reference: n.order_id, outcome: 'settlement', note: trace }
        : { reference: n.order_id, outcome: 'challenge', note: `${trace} (fraud review)` };
    }
    if (status === 'settlement') return { reference: n.order_id, outcome: 'settlement', note: trace };
    if (status === 'pending') return { reference: n.order_id, outcome: 'pending', note: trace };

    // deny | cancel | expire | failure | refund | partial_refund
    return { reference: n.order_id, outcome: 'failed', note: `Midtrans ${status}` };
  },
};

/** sha512(order_id + status_code + gross_amount + server_key). */
function verifySignature(n: MidtransNotification): boolean {
  const raw = `${n.order_id}${n.status_code}${n.gross_amount}${credential('payment.midtrans.server_key', 'MIDTRANS_SERVER_KEY')}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(n.signature_key ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
