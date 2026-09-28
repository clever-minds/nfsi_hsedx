import { gatewayFetch } from '../http';
import { formatAmount } from '../money';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';

/**
 * Mollie Payments — iDEAL, Bancontact, SEPA, cards across the EU.
 *
 * Mollie deliberately sends unsigned webhooks carrying only a payment id; the
 * documented pattern is to fetch that payment back over an authenticated
 * connection and trust the API's answer rather than the request body.
 */

const API = 'https://api.mollie.com/v2';

interface MolliePayment {
  id: string;
  status: string;
  metadata?: Record<string, string>;
  _links?: { checkout?: { href?: string } };
}

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${credential('payment.mollie.api_key', 'MOLLIE_API_KEY')}` };
}

export const mollieProvider: PaymentProvider = {
  id: 'mollie',
  label: 'Mollie',

  isConfigured() {
    return !!credential('payment.mollie.api_key', 'MOLLIE_API_KEY');
  },

  publicConfig() {
    return {};
  },

  supportedCurrencies() {
    return null; // EUR plus most European currencies, account dependent.
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const payment = await gatewayFetch<MolliePayment>({
      provider: 'mollie',
      url: `${API}/payments`,
      headers: auth(),
      body: {
        amount: { currency: p.currency.toUpperCase(), value: formatAmount(p.amount, p.currency) },
        description: p.description.slice(0, 255),
        redirectUrl: p.returnUrl,
        cancelUrl: p.cancelUrl,
        webhookUrl: p.notifyUrl,
        metadata: { payment_id: p.paymentId },
      },
    });

    const checkout = payment._links?.checkout?.href;
    if (!checkout) throw new Error('Mollie did not return a checkout link');

    return { redirectUrl: checkout, gatewayRef: payment.id };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    // Mollie posts `id=tr_xxx` as a form body and signs nothing.
    const id = (req.body as Record<string, string> | undefined)?.id;
    if (!id) return null;

    const payment = await gatewayFetch<MolliePayment>({
      provider: 'mollie',
      url: `${API}/payments/${encodeURIComponent(id)}`,
      method: 'GET',
      headers: auth(),
    });

    const reference = payment.metadata?.payment_id ?? '';
    if (!reference) return null;

    switch (payment.status) {
      case 'paid':
        return { reference, outcome: 'settlement', note: `Mollie ${payment.id}` };

      case 'failed':
      case 'canceled':
      case 'expired':
        return { reference, outcome: 'failed', note: `Mollie ${payment.status}` };

      case 'open':
      case 'pending':
      case 'authorized':
        return { reference, outcome: 'pending', note: `Mollie ${payment.status}` };

      default:
        return null;
    }
  },
};
