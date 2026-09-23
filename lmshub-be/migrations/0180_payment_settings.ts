import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Move payment gateway configuration out of `.env` and into Settings.
 *
 * Every gateway previously needed its keys pasted into `.env` and the server
 * restarted — which means a buyer has to open a terminal, edit a file they were
 * told never to share, and know which of seventeen variables belong together.
 * From here on the whole thing is a screen: tick the gateways you use, paste the
 * credentials, read the webhook URL off the same page.
 *
 * Secrets are marked `is_encrypted`, so the API returns them masked and the
 * audit log never records their value.
 *
 * `.env` still works. The resolver in `core/payment/config.ts` reads Settings
 * first and falls back to the environment, so an existing installation keeps
 * running untouched until someone opens the screen.
 */

/** key, group, label, type, default, encrypted, description */
type Row = [string, string, string, string, string | null, boolean, string];

const TOGGLES: Row[] = [
  ['payment.stripe.enabled', 'payment', 'Stripe', 'boolean', 'false', false,
   'Cards, Apple Pay and Google Pay. Available worldwide.'],
  ['payment.paypal.enabled', 'payment', 'PayPal', 'boolean', 'false', false,
   'PayPal balance and cards. Available worldwide.'],
  ['payment.razorpay.enabled', 'payment', 'Razorpay', 'boolean', 'false', false,
   'Cards, UPI, netbanking and wallets. India.'],
  ['payment.paystack.enabled', 'payment', 'Paystack', 'boolean', 'false', false,
   'Nigeria, Ghana, South Africa and Kenya.'],
  ['payment.flutterwave.enabled', 'payment', 'Flutterwave', 'boolean', 'false', false,
   'Cards, mobile money and USSD across Africa.'],
  ['payment.mollie.enabled', 'payment', 'Mollie', 'boolean', 'false', false,
   'iDEAL, Bancontact, SEPA and cards. Europe.'],
  ['payment.midtrans.enabled', 'payment', 'Midtrans', 'boolean', 'false', false,
   'E-wallets, virtual accounts and cards. Indonesia.'],
  ['payment.manual.enabled', 'payment', 'Manual bank transfer', 'boolean', 'true', false,
   'Buyers transfer to one of your bank accounts and an admin confirms it. Accounts are managed under Bank Accounts, not here.'],
];

const CREDENTIALS: Row[] = [
  // Stripe
  ['payment.stripe.publishable_key', 'payment_stripe', 'Publishable key', 'string', '', false,
   'Starts with pk_. Safe to expose; it is sent to the browser.'],
  ['payment.stripe.secret_key', 'payment_stripe', 'Secret key', 'string', '', true,
   'Starts with sk_. From dashboard.stripe.com/apikeys.'],
  ['payment.stripe.webhook_secret', 'payment_stripe', 'Webhook signing secret', 'string', '', true,
   'Starts with whsec_, issued when you register the webhook endpoint. Without it incoming notifications cannot be verified and are refused.'],

  // PayPal
  ['payment.paypal.client_id', 'payment_paypal', 'Client ID', 'string', '', false,
   'From developer.paypal.com, under Apps & Credentials.'],
  ['payment.paypal.client_secret', 'payment_paypal', 'Client secret', 'string', '', true,
   'Issued alongside the Client ID.'],
  ['payment.paypal.webhook_id', 'payment_paypal', 'Webhook ID', 'string', '', false,
   'Every delivery is verified against this ID. Without it notifications are refused.'],
  ['payment.paypal.live', 'payment_paypal', 'Use the live environment', 'boolean', 'false', false,
   'Unchecked means sandbox.'],

  // Razorpay
  ['payment.razorpay.key_id', 'payment_razorpay', 'Key ID', 'string', '', false,
   'From the Razorpay dashboard, under Settings then API Keys.'],
  ['payment.razorpay.key_secret', 'payment_razorpay', 'Key secret', 'string', '', true,
   'Shown once when the key is generated.'],
  ['payment.razorpay.webhook_secret', 'payment_razorpay', 'Webhook secret', 'string', '', true,
   'The secret you chose when creating the webhook.'],

  // Paystack
  ['payment.paystack.public_key', 'payment_paystack', 'Public key', 'string', '', false,
   'Starts with pk_. Safe to expose.'],
  ['payment.paystack.secret_key', 'payment_paystack', 'Secret key', 'string', '', true,
   'Starts with sk_. Paystack signs webhooks with this key, so there is no separate webhook secret.'],

  // Flutterwave
  ['payment.flutterwave.public_key', 'payment_flutterwave', 'Public key', 'string', '', false,
   'From app.flutterwave.com, under Settings then API.'],
  ['payment.flutterwave.secret_key', 'payment_flutterwave', 'Secret key', 'string', '', true,
   'Issued alongside the public key.'],
  ['payment.flutterwave.webhook_hash', 'payment_flutterwave', 'Webhook secret hash', 'string', '', true,
   'A value you invent on the Flutterwave webhook page. Paste the same string here.'],

  // Mollie
  ['payment.mollie.api_key', 'payment_mollie', 'API key', 'string', '', true,
   'From my.mollie.com, under Developers then API keys. Mollie does not sign webhooks; the server re-reads each payment from Mollie before settling, so no extra secret is needed.'],

  // Midtrans
  ['payment.midtrans.client_key', 'payment_midtrans', 'Client key', 'string', '', false,
   'Sent to the browser so the Snap popup can open.'],
  ['payment.midtrans.server_key', 'payment_midtrans', 'Server key', 'string', '', true,
   'From dashboard.midtrans.com, under Settings then Access Keys.'],
  ['payment.midtrans.production', 'payment_midtrans', 'Use the production environment', 'boolean', 'false', false,
   'Unchecked means sandbox.'],
];

function insert(pgm: MigrationBuilder, rows: Row[]): void {
  const values = rows
    .map(([key, grup, label, tipe, nilai, enc, desc]) => {
      const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
      return `(${q(key)}, ${q(grup)}, ${q(label)}, ${q(tipe)}, ${q(nilai)}, false, ${enc}, ${q(desc)})`;
    })
    .join(',\n      ');

  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, is_public, is_encrypted, deskripsi) VALUES
      ${values}
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  insert(pgm, TOGGLES);
  insert(pgm, CREDENTIALS);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  const keys = [...TOGGLES, ...CREDENTIALS].map(([k]) => `'${k}'`).join(', ');
  pgm.sql(`DELETE FROM settings WHERE key IN (${keys});`);
}
