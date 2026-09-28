/**
 * Shared contract for every payment gateway adapter.
 *
 * Adapters are deliberately thin: they translate between our order/payment
 * records and one provider's REST API, and nothing else. All money movement
 * decisions stay in `modules/orders` so that adding a provider can never
 * change how an order is settled.
 */

/** Internal decision derived from a provider's transaction status. */
export type PaymentOutcome = 'settlement' | 'pending' | 'failed' | 'challenge';

export interface CheckoutCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CheckoutParams {
  /** Our `payments.id`. Passed to the provider so webhooks can find it again. */
  paymentId: string;
  /** Amount in major units (e.g. 55.00 USD, 150000 IDR). */
  amount: number;
  /** ISO 4217 code, uppercase. */
  currency: string;
  description: string;
  customer: CheckoutCustomer;
  /** Where the buyer lands after paying. */
  returnUrl: string;
  /** Where the buyer lands after cancelling. */
  cancelUrl: string;
  /** Public webhook endpoint for this provider. */
  notifyUrl: string;
}

export interface CheckoutResult {
  /** URL the buyer must open to complete payment. */
  redirectUrl: string;
  /**
   * Provider-side identifier, when it differs from `paymentId`. Stored in
   * `payments.referensi_gateway` so webhooks that only echo their own id can
   * still be resolved.
   */
  gatewayRef?: string;
  /** Extra data the frontend needs (e.g. a client key or an embed token). */
  meta?: Record<string, unknown>;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Exact bytes as received — required for HMAC signature checks. */
  rawBody: Buffer | null;
  body: unknown;
}

export interface WebhookEvent {
  /** Our `payments.id`, or the provider reference stored at checkout time. */
  reference: string;
  /** True when `reference` holds a provider id rather than our payment id. */
  referenceIsGateway?: boolean;
  outcome: PaymentOutcome;
  /** Short human-readable trace written to `catatan_verifikasi`. */
  note?: string;
}

export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** Credentials present in env? Unconfigured providers are hidden from buyers. */
  isConfigured(): boolean;
  /** Non-secret values safe to expose to the browser. */
  publicConfig(): Record<string, unknown>;
  /** Currencies this provider can charge, or `null` when it accepts any. */
  supportedCurrencies(): string[] | null;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  /**
   * Verify authenticity and translate the payload. Returns `null` for events
   * that are authentic but irrelevant (subscriptions, disputes, test pings).
   * Throws when verification fails, so the caller can answer 403.
   */
  handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null>;
}
