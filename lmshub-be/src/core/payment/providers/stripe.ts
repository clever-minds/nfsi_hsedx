import crypto from 'crypto';
import { gatewayFetch, header } from '../http';
import { toMinorUnits } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';

/**
 * Stripe Checkout (hosted).
 *
 * We create a Checkout Session and hand the buyer its URL; settlement only
 * ever happens through the webhook, never on the browser redirect back.
 */

const API = 'https://api.stripe.com/v1';

/** Reject webhooks older than this to blunt replay attempts. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

interface StripeSession {
  id: string;
  url: string;
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${credential('payment.stripe.secret_key', 'STRIPE_SECRET_KEY')}` };
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',
  label: 'Stripe',

  isConfigured() {
    return !!credential('payment.stripe.secret_key', 'STRIPE_SECRET_KEY');
  },

  publicConfig() {
    return { publishable_key: credential('payment.stripe.publishable_key', 'STRIPE_PUBLISHABLE_KEY') || null };
  },

  supportedCurrencies() {
    return null; // Stripe settles in 135+ currencies; the account decides.
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    // Stripe's API is form-encoded and uses bracket notation for nesting.
    const form: Record<string, string> = {
      mode: 'payment',
      success_url: p.returnUrl,
      cancel_url: p.cancelUrl,
      client_reference_id: p.paymentId,
      'metadata[payment_id]': p.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': p.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(toMinorUnits(p.amount, p.currency)),
      'line_items[0][price_data][product_data][name]': p.description,
    };
    if (p.customer.email) form.customer_email = p.customer.email;

    const session = await gatewayFetch<StripeSession>({
      provider: 'stripe',
      url: `${API}/checkout/sessions`,
      headers: auth(),
      body: form,
      form: true,
    });

    return { redirectUrl: session.url, gatewayRef: session.id };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!credential('payment.stripe.webhook_secret', 'STRIPE_WEBHOOK_SECRET')) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    if (!req.rawBody) throw new Error('Stripe webhook requires the raw request body');

    verifySignature(req.rawBody, header(req.headers, 'stripe-signature'));

    const event = JSON.parse(req.rawBody.toString('utf8')) as StripeEvent;
    const object = event.data?.object ?? {};
    const reference = (object.client_reference_id as string) ?? ((object.metadata as Record<string, string>)?.payment_id ?? '');
    if (!reference) return null;

    switch (event.type) {
      case 'checkout.session.completed':
        // Delayed methods (bank debits) complete the session while still unpaid.
        return object.payment_status === 'paid'
          ? { reference, outcome: 'settlement', note: `Stripe ${object.id}` }
          : { reference, outcome: 'pending', note: `Stripe awaiting ${object.payment_status}` };

      case 'checkout.session.async_payment_succeeded':
        return { reference, outcome: 'settlement', note: `Stripe ${object.id}` };

      case 'checkout.session.async_payment_failed':
        return { reference, outcome: 'failed', note: 'Stripe async payment failed' };

      case 'checkout.session.expired':
        return { reference, outcome: 'failed', note: 'Stripe session expired' };

      default:
        return null; // refunds, disputes, subscription events — not ours to act on
    }
  },
};

/** Verify `t=<ts>,v1=<hmac>` against HMAC-SHA256(`<ts>.<body>`, secret). */
function verifySignature(rawBody: Buffer, signatureHeader: string): void {
  const parts = new Map(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim() ?? '', v?.trim() ?? ''] as const;
    }),
  );

  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !signature) throw new Error('Malformed Stripe-Signature header');

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('Stripe webhook timestamp outside tolerance');
  }

  const expected = crypto
    .createHmac('sha256', credential('payment.stripe.webhook_secret', 'STRIPE_WEBHOOK_SECRET'))
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Stripe webhook signature mismatch');
  }
}
