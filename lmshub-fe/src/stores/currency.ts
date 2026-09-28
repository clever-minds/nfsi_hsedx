import { defineStore } from 'pinia';
import { apiGet } from '@/lib/api';
import { currentLocale } from '@/i18n';
import { DEFAULT_CURRENCY } from '@/lib/currencies';

/**
 * Currencies offered to the reader.
 *
 * Every amount in the system is stored in the store's base currency. A display
 * currency multiplies by a rate at render time and nothing else — no stored
 * amount is ever rewritten, so changing a rate cannot alter an order that has
 * already been placed.
 *
 * `'auto'` follows the interface language, which is what most visitors expect
 * and what makes the picker feel like part of the language control rather than
 * a second unrelated setting.
 */

const STORAGE_KEY = 'display_currency';

/** Language → currency, used only by `'auto'`. Ignored when the currency is off. */
const LOCALE_CURRENCY: Record<string, string> = {
  en: 'USD',
  id: 'IDR',
  ar: 'SAR',
  hi: 'INR',
};

export interface CurrencyOption {
  kode: string;
  nama: string;
  simbol: string;
  /** One base unit equals this many of this currency. */
  rate: number;
  desimal: number;
  is_basis: boolean;
}

export const useCurrencyStore = defineStore('currency', {
  state: () => ({
    base: DEFAULT_CURRENCY,
    list: [] as CurrencyOption[],
    /** `'auto'` or an ISO code the reader picked. */
    choice: (localStorage.getItem(STORAGE_KEY) || 'auto') as string,
    switcherEnabled: false,
    ready: false,
  }),

  getters: {
    /**
     * The currency prices are drawn in.
     *
     * Falls back to the base whenever the choice is unknown, inactive, or the
     * list has not arrived yet. A missing rate must never reach a price label:
     * it would render a number that looks authoritative and is wrong.
     */
    active(state): CurrencyOption {
      const fallback: CurrencyOption = {
        kode: state.base,
        nama: state.base,
        simbol: '',
        rate: 1,
        desimal: 2,
        is_basis: true,
      };
      if (!state.list.length) return fallback;

      const wanted =
        state.choice === 'auto' ? (LOCALE_CURRENCY[currentLocale()] ?? state.base) : state.choice;

      return (
        state.list.find((c) => c.kode === wanted) ??
        state.list.find((c) => c.is_basis) ??
        fallback
      );
    },

    /** Show the picker only when there is a real choice to make. */
    canSwitch(state): boolean {
      return state.switcherEnabled && state.list.length > 1;
    },
  },

  actions: {
    async bootstrap() {
      if (this.ready) return;
      try {
        const d = await apiGet<{ base: string; switcher: boolean; currencies: CurrencyOption[] }>(
          '/currencies/public',
        );
        this.base = (d.base || DEFAULT_CURRENCY).toUpperCase();
        this.list = d.currencies ?? [];
        this.switcherEnabled = !!d.switcher;
      } catch {
        // Offline or pre-install: prices still render, in the base currency.
        this.list = [];
      } finally {
        this.ready = true;
      }
    },

    setChoice(code: string) {
      this.choice = code;
      if (code === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, code.toUpperCase());
    },
  },
});
