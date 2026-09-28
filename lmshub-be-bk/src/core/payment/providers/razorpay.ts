import crypto from 'crypto';
import { basicAuth, gatewayFetch, header } from '../http';
import { toMinorUnits } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';

/** Razorpay Payment Links — the hosted flow, no client-side SDK required. */

const API = 'https://api.razorpay.com/v1';

interface PaymentLink {
  id: string;
  short_url: string;
}

interface RazorpayWebhook {
  event: string;
  payload?: {
    payment_link?: { entity?: Record<string, unknown> };
    payment?: { entity?: Record<string, unknown> };
  };
}

export const razorpayProvider: PaymentProvider = {
  id: 'razorpay',
  label: 'Razorpay',

  isConfigured() {
    return !!(credential('payment.razorpay.key_id', 'RAZORPAY_KEY_ID') && credential('payment.razorpay.key_secret', 'RAZORPAY_KEY_SECRET'));
  },

  publicConfig() {
    return { key_id: credential('payment.razorpay.key_id', 'RAZORPAY_KEY_ID') || null };
  },

  supportedCurrencies() {
    return null; // INR by default; international currencies depend on the account.
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const link = await gatewayFetch<PaymentLink>({
      provider: 'razorpay',
      url: `${API}/payment_links`,
      headers: { Authorization: basicAuth(credential('payment.razorpay.key_id', 'RAZORPAY_KEY_ID'), credential('payment.razorpay.key_secret', 'RAZORPAY_KEY_SECRET')) },
      body: {
        amount: toMinorUnits(p.amount, p.currency),
        currency: p.currency.toUpperCase(),
        description: p.description.slice(0, 2048),
        reference_id: p.paymentId,
        callback_url: p.returnUrl,
        callback_method: 'get',
        notes: { payment_id: p.paymentId },
        customer: {
          name: p.customer.name ?? undefined,
          email: p.customer.email ?? undefined,
          contact: p.customer.phone ?? undefined,
        },
        // Razorpay would otherwise send its own emails and texts to the buyer.
        notify: { sms: false, email: false },
      },
    });

    return { redirectUrl: link.short_url, gatewayRef: link.id };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!credential('payment.razorpay.webhook_secret', 'RAZORPAY_WEBHOOK_SECRET')) throw new Error('RAZORPAY_WEBHOOK_SECRET is not set');
    if (!req.rawBody) throw new Error('Razorpay webhook requires the raw request body');

    const expected = crypto
      .createHmac('sha256', credential('payment.razorpay.webhook_secret', 'RAZORPAY_WEBHOOK_SECRET'))
      .update(req.rawBody)
      .digest('hex');
    const received = header(req.headers, 'x-razorpay-signature');

    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Razorpay webhook signature mismatch');
    }

    const event = JSON.parse(req.rawBody.toString('utf8')) as RazorpayWebhook;
    const link = event.payload?.payment_link?.entity ?? {};
    const payment = event.payload?.payment?.entity ?? {};
    const reference =
      (link.reference_id as string) ?? ((payment.notes as Record<string, string>)?.payment_id ?? '');
    if (!reference) return null;

    switch (event.event) {
      case 'payment_link.paid':
      case 'payment.captured':
        return { reference, outcome: 'settlement', note: `Razorpay ${payment.id ?? link.id ?? ''}`.trim() };

      case 'payment.failed':
      case 'payment_link.cancelled':
      case 'payment_link.expired':
        return { reference, outcome: 'failed', note: `Razorpay ${event.event}` };

      default:
        return null;
    }
  },
};
