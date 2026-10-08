import crypto from 'crypto';
import { gatewayFetch } from '../http';
import type { CheckoutParams, CheckoutResult, PaymentProvider, WebhookEvent, WebhookRequest } from '../types';
import { credential } from '../config';
import { env } from '../../config/env';

/** Easebuzz Payment Gateway */

interface EasebuzzInitResponse {
  status: number;
  data: string;
}

export const easebuzzProvider: PaymentProvider = {
  id: 'easebuzz',
  label: 'Easebuzz',

  isConfigured() {
    return !!(credential('payment.easebuzz.key', 'EASEBUZZ_KEY') && credential('payment.easebuzz.salt', 'EASEBUZZ_SALT'));
  },

  publicConfig() {
    return null; // Easebuzz initiates from backend
  },

  supportedCurrencies() {
    return ['INR'];
  },

  async createCheckout(p: CheckoutParams): Promise<CheckoutResult> {
    const key = credential('payment.easebuzz.key', 'EASEBUZZ_KEY');
    const salt = credential('payment.easebuzz.salt', 'EASEBUZZ_SALT');
    const envStr = credential('payment.easebuzz.env', 'EASEBUZZ_ENV') || 'test';
    
    const isProd = envStr === 'prod' || envStr === 'production' || envStr === 'true';
    const baseUrl = isProd ? 'https://pay.easebuzz.in' : 'https://testpay.easebuzz.in';
    const endpoint = `${baseUrl}/payment/initiateLink`;

    const txnid = p.paymentId;
    const amount = p.amount.toFixed(2); // Amount must be 2 decimal float string
    const productinfo = p.description.slice(0, 100) || 'Order';
    const firstname = p.customer.name?.slice(0, 50) || 'Customer';
    const email = p.customer.email || 'customer@example.com';
    const phone = p.customer.phone || '9999999999';
    const proxyUrl = `${env.APP_URL}/api/v1/orders/redirect?url=`;
    const surl = proxyUrl + encodeURIComponent(p.returnUrl);
    const furl = proxyUrl + encodeURIComponent(p.cancelUrl || p.returnUrl);

    // hash sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    const form = {
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash
    };

    const res = await gatewayFetch<EasebuzzInitResponse | { status: number, error_desc: string }>({
      provider: 'easebuzz',
      url: endpoint,
      method: 'POST',
      form: true,
      body: form,
    });

    if (res.status !== 1) {
      throw new Error(`Easebuzz initiation failed: ${'error_desc' in res ? res.error_desc : 'Unknown error'}`);
    }

    const accessKey = (res as EasebuzzInitResponse).data;
    const redirectUrl = `${baseUrl}/pay/${accessKey}`;

    return { redirectUrl, gatewayRef: accessKey };
  },

  async handleWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    // Webhook from Easebuzz is application/x-www-form-urlencoded POST
    const salt = credential('payment.easebuzz.salt', 'EASEBUZZ_SALT');
    if (!salt) throw new Error('EASEBUZZ_SALT is not set');

    // Express parses form data into req.body if urlencoded middleware is used
    // Otherwise we need to parse req.rawBody
    let data: Record<string, string> = {};
    if (req.rawBody) {
      const parsed = new URLSearchParams(req.rawBody.toString('utf8'));
      for (const [k, v] of parsed.entries()) {
        data[k] = v;
      }
    }

    const { txnid, easepayid, status, hash } = data;
    if (!txnid || !easepayid || !status || !hash) return null;

    // Hash format for incoming validation:
    // salt|status|||||||||||email|firstname|productinfo|amount|txnid|key
    const key = credential('payment.easebuzz.key', 'EASEBUZZ_KEY');
    const amount = data.amount;
    const productinfo = data.productinfo;
    const firstname = data.firstname;
    const email = data.email;

    const hashString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
    const expectedHash = crypto.createHash('sha512').update(hashString).digest('hex');

    if (hash !== expectedHash) {
      throw new Error('Easebuzz webhook signature mismatch');
    }

    const reference = txnid;
    if (status === 'success') {
      return { reference, outcome: 'settlement', note: `Easebuzz ${easepayid}` };
    } else if (status === 'dropped' || status === 'bounced' || status === 'failed') {
      return { reference, outcome: 'failed', note: `Easebuzz ${status}` };
    }

    return { reference, outcome: 'pending', note: `Easebuzz ${status}` };
  },
};
