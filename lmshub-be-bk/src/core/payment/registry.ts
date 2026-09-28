import { flutterwaveProvider } from './providers/flutterwave';
import { midtransProvider } from './providers/midtrans';
import { mollieProvider } from './providers/mollie';
import { paypalProvider } from './providers/paypal';
import { paystackProvider } from './providers/paystack';
import { razorpayProvider } from './providers/razorpay';
import { stripeProvider } from './providers/stripe';
import { gatewayEnabled } from './config';
import type { PaymentProvider } from './types';

/**
 * The gateway roster.
 *
 * Order matters only for presentation — the checkout screen lists providers in
 * this sequence, so the globally usable ones come first.
 */
const PROVIDERS: readonly PaymentProvider[] = [
  stripeProvider,
  paypalProvider,
  razorpayProvider,
  paystackProvider,
  flutterwaveProvider,
  mollieProvider,
  midtransProvider,
];

export function allProviders(): readonly PaymentProvider[] {
  return PROVIDERS;
}

export function getProvider(id: string): PaymentProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/**
 * Providers a buyer may actually pick.
 *
 * Two conditions, not one: the credentials have to be present, and the gateway
 * has to be switched on. The switch lives on the Settings screen so a store can
 * keep keys on file while taking a gateway off checkout — during a dispute, or
 * while testing a replacement — without deleting them.
 */
export function configuredProviders(): PaymentProvider[] {
  return PROVIDERS.filter((p) => p.isConfigured() && gatewayEnabled(p.id, p.isConfigured()));
}

/**
 * Providers that can actually charge in the store's currency. Offering a
 * gateway that will reject the currency at the last step is worse than not
 * offering it at all.
 */
export function availableProviders(currency: string): PaymentProvider[] {
  const code = currency.toUpperCase();
  return configuredProviders().filter((p) => {
    const supported = p.supportedCurrencies();
    return supported === null || supported.includes(code);
  });
}

export function isAnyConfigured(): boolean {
  return PROVIDERS.some((p) => p.isConfigured());
}

export * from './types';
