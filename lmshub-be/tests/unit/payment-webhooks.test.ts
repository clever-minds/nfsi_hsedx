import crypto from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import type { PaymentProvider, WebhookRequest } from '../../src/core/payment/types';

/**
 * Signature verification is the only thing standing between a stranger's HTTP
 * request and a course being handed out for free, so each adapter is checked
 * against a forged body, a forged signature, and a replayed timestamp.
 *
 * Credentials must be in place before `config/env` is first imported, hence the
 * dynamic imports below.
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'rzp_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_webhook_secret';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test';

let stripe: PaymentProvider;
let razorpay: PaymentProvider;
let paystack: PaymentProvider;
let midtrans: PaymentProvider;

beforeAll(async () => {
  stripe = (await import('../../src/core/payment/providers/stripe')).stripeProvider;
  razorpay = (await import('../../src/core/payment/providers/razorpay')).razorpayProvider;
  paystack = (await import('../../src/core/payment/providers/paystack')).paystackProvider;
  midtrans = (await import('../../src/core/payment/providers/midtrans')).midtransProvider;
});

function request(body: unknown, headers: Record<string, string>): WebhookRequest {
  const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { headers, rawBody: raw, body: typeof body === 'string' ? body : JSON.parse(raw.toString()) };
}

// ── Stripe ────────────────────────────────────────────────────────────────

function stripeSigned(payload: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(payload);
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac('sha256', opts.secret ?? 'whsec_test_secret')
    .update(`${ts}.${body}`)
    .digest('hex');
  return {
    headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
    rawBody: Buffer.from(body),
    body: payload,
  } as WebhookRequest;
}

const stripePaid = {
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', client_reference_id: 'pay-1', payment_status: 'paid' } },
};

describe('stripe webhook verification', () => {
  it('accepts a correctly signed event', async () => {
    const event = await stripe.handleWebhook(stripeSigned(stripePaid));
    expect(event).toEqual({ reference: 'pay-1', outcome: 'settlement', note: 'Stripe cs_test_1' });
  });

  it('rejects a signature made with the wrong secret', async () => {
    await expect(stripe.handleWebhook(stripeSigned(stripePaid, { secret: 'whsec_attacker' }))).rejects.toThrow(
      /signature mismatch/i,
    );
  });

  it('rejects a body tampered with after signing', async () => {
    const signed = stripeSigned(stripePaid);
    signed.rawBody = Buffer.from(JSON.stringify({ ...stripePaid, data: { object: { client_reference_id: 'pay-2', payment_status: 'paid' } } }));
    await expect(stripe.handleWebhook(signed)).rejects.toThrow(/signature mismatch/i);
  });

  it('rejects a replayed event outside the timestamp tolerance', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    await expect(stripe.handleWebhook(stripeSigned(stripePaid, { timestamp: stale }))).rejects.toThrow(/tolerance/i);
  });

  it('holds a completed session that has not actually paid', async () => {
    const unpaid = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', client_reference_id: 'pay-3', payment_status: 'unpaid' } },
    };
    const event = await stripe.handleWebhook(stripeSigned(unpaid));
    expect(event?.outcome).toBe('pending');
  });

  it('ignores events it has no business acting on', async () => {
    const other = { type: 'charge.refunded', data: { object: { client_reference_id: 'pay-1' } } };
    expect(await stripe.handleWebhook(stripeSigned(other))).toBeNull();
  });
});

// ── Razorpay ──────────────────────────────────────────────────────────────

function razorpaySigned(payload: unknown, secret = 'rzp_webhook_secret'): WebhookRequest {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return { headers: { 'x-razorpay-signature': sig }, rawBody: Buffer.from(body), body: payload };
}

describe('razorpay webhook verification', () => {
  const paid = {
    event: 'payment_link.paid',
    payload: { payment_link: { entity: { id: 'plink_1', reference_id: 'pay-9' } }, payment: { entity: { id: 'pay_rzp' } } },
  };

  it('accepts a correctly signed event', async () => {
    const event = await razorpay.handleWebhook(razorpaySigned(paid));
    expect(event?.reference).toBe('pay-9');
    expect(event?.outcome).toBe('settlement');
  });

  it('rejects a forged signature', async () => {
    await expect(razorpay.handleWebhook(razorpaySigned(paid, 'wrong'))).rejects.toThrow(/signature mismatch/i);
  });

  it('marks a failed payment as failed', async () => {
    const failed = { event: 'payment.failed', payload: { payment: { entity: { id: 'p', notes: { payment_id: 'pay-9' } } } } };
    const event = await razorpay.handleWebhook(razorpaySigned(failed));
    expect(event?.outcome).toBe('failed');
  });
});

// ── Paystack ──────────────────────────────────────────────────────────────

function paystackSigned(payload: unknown, secret = 'sk_test_paystack'): WebhookRequest {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');
  return { headers: { 'x-paystack-signature': sig }, rawBody: Buffer.from(body), body: payload };
}

describe('paystack webhook verification', () => {
  const success = { event: 'charge.success', data: { reference: 'pay-7', amount: 500000 } };

  it('accepts a correctly signed event', async () => {
    const event = await paystack.handleWebhook(paystackSigned(success));
    expect(event).toMatchObject({ reference: 'pay-7', outcome: 'settlement' });
  });

  it('rejects a forged signature', async () => {
    await expect(paystack.handleWebhook(paystackSigned(success, 'sk_attacker'))).rejects.toThrow(/signature mismatch/i);
  });
});

// ── Midtrans ──────────────────────────────────────────────────────────────

function midtransBody(over: Record<string, unknown> = {}) {
  const base = {
    order_id: 'pay-4',
    status_code: '200',
    gross_amount: '750000.00',
    transaction_status: 'settlement',
    ...over,
  };
  const raw = `${base.order_id}${base.status_code}${base.gross_amount}SB-Mid-server-test`;
  return { ...base, signature_key: crypto.createHash('sha512').update(raw).digest('hex') };
}

describe('midtrans webhook verification', () => {
  it('accepts a correctly signed notification', async () => {
    const event = await midtrans.handleWebhook(request(midtransBody(), {}));
    expect(event).toMatchObject({ reference: 'pay-4', outcome: 'settlement' });
  });

  it('rejects a forged signature', async () => {
    const forged = { ...midtransBody(), signature_key: 'a'.repeat(128) };
    await expect(midtrans.handleWebhook(request(forged, {}))).rejects.toThrow(/signature mismatch/i);
  });

  it('rejects a body whose amount was raised after signing', async () => {
    const tampered = { ...midtransBody(), gross_amount: '1.00' };
    await expect(midtrans.handleWebhook(request(tampered, {}))).rejects.toThrow(/signature mismatch/i);
  });

  it('routes a fraud-flagged capture to manual review', async () => {
    const event = await midtrans.handleWebhook(
      request(midtransBody({ transaction_status: 'capture', fraud_status: 'challenge' }), {}),
    );
    expect(event?.outcome).toBe('challenge');
  });

  it('settles an accepted capture', async () => {
    const event = await midtrans.handleWebhook(
      request(midtransBody({ transaction_status: 'capture', fraud_status: 'accept' }), {}),
    );
    expect(event?.outcome).toBe('settlement');
  });

  it('maps every terminal status to failed', async () => {
    for (const status of ['deny', 'cancel', 'expire', 'failure']) {
      const event = await midtrans.handleWebhook(request(midtransBody({ transaction_status: status }), {}));
      expect(event?.outcome).toBe('failed');
    }
  });
});
