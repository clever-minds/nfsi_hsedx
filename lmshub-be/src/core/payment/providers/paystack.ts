import crypto from 'crypto';
import { gatewayFetch, header } from '../http';
import { toMinorUnits } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';

/** Paystack hosted checkout — Nigeria, Ghana, South Africa, Kenya. */

const API = 'https://api.paystack.co';

const SUPPORTED = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];

interface InitResponse {
  status: boolean;
  data: { authorization_url: string; access_code: string; reference: string };
}

interface PaystackWebhook {
  event: string;
  data?: Record<string, unknown>;
}

export const paystackProvider: PaymentProvider = {
  id: 'paystack',
  label: 'Paystack',

  isConfigured() {
    return !!credential('payment.paystack.secret_key', 'PAYSTACK_SECRET_KEY');
  },

  publicConfig() {
    return { public_key: credential('payment.paystack.public_key', 'PAYSTACK_PUBLIC_KEY') || null };
  },

  supportedCurrencies() {
    return SUPPORTED;
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    if (!p.customer.email) throw new Error('Paystack requires a buyer email address');

    const res = await gatewayFetch<InitResponse>({
      provider: 'paystack',
      url: `${API}/transaction/initialize`,
      headers: { Authorization: `Bearer ${credential('payment.paystack.secret_key', 'PAYSTACK_SECRET_KEY')}` },
      body: {
        email: p.customer.email,
        amount: toMinorUnits(p.amount, p.currency),
        currency: p.currency.toUpperCase(),
        reference: p.paymentId,
        callback_url: p.returnUrl,
        metadata: { payment_id: p.paymentId, description: p.description },
      },
    });

    if (!res.status) throw new Error('Paystack refused to initialise the transaction');
    return { redirectUrl: res.data.authorization_url, gatewayRef: res.data.reference };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!req.rawBody) throw new Error('Paystack webhook requires the raw request body');

    // Paystack signs with the secret key itself, using SHA-512.
    const expected = crypto
      .createHmac('sha512', credential('payment.paystack.secret_key', 'PAYSTACK_SECRET_KEY'))
      .update(req.rawBody)
      .digest('hex');
    const received = header(req.headers, 'x-paystack-signature');

    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Paystack webhook signature mismatch');
    }

    const event = JSON.parse(req.rawBody.toString('utf8')) as PaystackWebhook;
    const data = event.data ?? {};
    const reference =
      (data.reference as string) ?? ((data.metadata as Record<string, string>)?.payment_id ?? '');
    if (!reference) return null;

    switch (event.event) {
      case 'charge.success':
        return { reference, outcome: 'settlement', note: `Paystack ${reference}` };

      case 'charge.failed':
        return { reference, outcome: 'failed', note: 'Paystack charge failed' };

      default:
        return null;
    }
  },
};
