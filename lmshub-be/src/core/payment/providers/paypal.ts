import { env } from '../../config/env';
import { basicAuth, gatewayFetch, header } from '../http';
import { formatAmount } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential, toggle } from '../config';

/**
 * PayPal Orders v2 (hosted approval flow).
 *
 * PayPal splits approval from capture: the buyer approves, then the merchant
 * must claim the money. We capture from the webhook rather than the browser
 * redirect, so an abandoned tab can never leave an approved-but-unclaimed order.
 */

function api(): string {
  return toggle('payment.paypal.live', env.PAYPAL_IS_PRODUCTION) ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

/** PayPal currencies must have no more than 2 decimals. */
const SUPPORTED = [
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY',
  'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD', 'SEK', 'CHF',
  'THB', 'USD',
];

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface PayPalOrder {
  id: string;
  links?: Array<{ rel: string; href: string }>;
}

interface PayPalWebhook {
  event_type: string;
  resource?: Record<string, unknown>;
}

/** Access tokens live ~9 hours; re-minting one per call would be wasteful. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await gatewayFetch<TokenResponse>({
    provider: 'paypal',
    url: `${api()}/v1/oauth2/token`,
    headers: { Authorization: basicAuth(credential('payment.paypal.client_id', 'PAYPAL_CLIENT_ID'), credential('payment.paypal.client_secret', 'PAYPAL_CLIENT_SECRET')) },
    body: { grant_type: 'client_credentials' },
    form: true,
  });

  // Expire a minute early so a token never dies mid-request.
  cachedToken = { value: res.access_token, expiresAt: Date.now() + (res.expires_in - 60) * 1000 };
  return res.access_token;
}

async function authed(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await accessToken()}` };
}

export const paypalProvider: PaymentProvider = {
  id: 'paypal',
  label: 'PayPal',

  isConfigured() {
    return !!(credential('payment.paypal.client_id', 'PAYPAL_CLIENT_ID') && credential('payment.paypal.client_secret', 'PAYPAL_CLIENT_SECRET'));
  },

  publicConfig() {
    return { client_id: credential('payment.paypal.client_id', 'PAYPAL_CLIENT_ID') || null, is_production: toggle('payment.paypal.live', env.PAYPAL_IS_PRODUCTION) };
  },

  supportedCurrencies() {
    return SUPPORTED;
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const order = await gatewayFetch<PayPalOrder>({
      provider: 'paypal',
      url: `${api()}/v2/checkout/orders`,
      headers: await authed(),
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: p.paymentId,
            custom_id: p.paymentId,
            description: p.description.slice(0, 127),
            amount: { currency_code: p.currency.toUpperCase(), value: formatAmount(p.amount, p.currency) },
          },
        ],
        application_context: {
          return_url: p.returnUrl,
          cancel_url: p.cancelUrl,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      },
    });

    const approve = order.links?.find((l) => l.rel === 'approve')?.href;
    if (!approve) throw new Error('PayPal did not return an approval link');

    return { redirectUrl: approve, gatewayRef: order.id };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!credential('payment.paypal.webhook_id', 'PAYPAL_WEBHOOK_ID')) throw new Error('PAYPAL_WEBHOOK_ID is not set');

    const event = req.body as PayPalWebhook;
    await verifyWebhook(req, event);

    const resource = event.resource ?? {};

    switch (event.event_type) {
      case 'CHECKOUT.ORDER.APPROVED': {
        // Approved only means the buyer said yes — claim the money now.
        const orderId = resource.id as string;
        const reference = referenceFromOrder(resource) ?? orderId;
        const captured = await captureOrder(orderId);
        return captured
          ? { reference, outcome: 'settlement', note: `PayPal capture ${orderId}` }
          : { reference, outcome: 'pending', note: `PayPal capture pending ${orderId}` };
      }

      case 'PAYMENT.CAPTURE.COMPLETED': {
        const reference = (resource.custom_id as string) ?? '';
        if (!reference) return null;
        return { reference, outcome: 'settlement', note: `PayPal capture ${resource.id ?? ''}`.trim() };
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        const reference = (resource.custom_id as string) ?? '';
        if (!reference) return null;
        return { reference, outcome: 'failed', note: `PayPal ${event.event_type}` };
      }

      default:
        return null;
    }
  },
};

function referenceFromOrder(resource: Record<string, unknown>): string | null {
  const units = resource.purchase_units as Array<Record<string, unknown>> | undefined;
  const unit = units?.[0];
  return (unit?.custom_id as string) ?? (unit?.reference_id as string) ?? null;
}

/** Returns true once the capture reads COMPLETED. */
async function captureOrder(orderId: string): Promise<boolean> {
  const res = await gatewayFetch<{ status?: string }>({
    provider: 'paypal',
    url: `${api()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    headers: await authed(),
    body: {},
  });
  return res.status === 'COMPLETED';
}

/**
 * PayPal signs with a rotating certificate, so verification is a call back to
 * PayPal rather than a local HMAC.
 */
async function verifyWebhook(req: WebhookRequest, event: PayPalWebhook): Promise<void> {
  const res = await gatewayFetch<{ verification_status?: string }>({
    provider: 'paypal',
    url: `${api()}/v1/notifications/verify-webhook-signature`,
    headers: await authed(),
    body: {
      auth_algo: header(req.headers, 'paypal-auth-algo'),
      cert_url: header(req.headers, 'paypal-cert-url'),
      transmission_id: header(req.headers, 'paypal-transmission-id'),
      transmission_sig: header(req.headers, 'paypal-transmission-sig'),
      transmission_time: header(req.headers, 'paypal-transmission-time'),
      webhook_id: credential('payment.paypal.webhook_id', 'PAYPAL_WEBHOOK_ID'),
      webhook_event: event,
    },
  });

  if (res.verification_status !== 'SUCCESS') throw new Error('PayPal webhook signature mismatch');
}
