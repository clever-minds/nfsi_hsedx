import { defineStore } from 'pinia';
import { apiGet, assetUrl } from '@/lib/api';
import { DEFAULT_CURRENCY, isSupportedCurrency } from '@/lib/currencies';

/** name yang dipakai bila admin belum mengisi apa pun. */
const DEFAULT_APP_NAME = 'LMS Hub';

/**
 * Konfigurasi yang boleh read siapa saja (`settings.is_public` di backend).
 * Dimuat sekali saat aplikasi start karena area pra-login pun perlu tahu name
 * aplikasi, logo, dan mata uang untuk menggambar dirinya sendiri.
 */
export const useAppConfigStore = defineStore('appConfig', {
  state: () => ({
    currency: DEFAULT_CURRENCY,
    appName: DEFAULT_APP_NAME,
    /** Baris footer mentah; `:year` dan `:name` belum disubstitusi. */
    footerTemplate: '',
    logoUrl: '',
    iconUrl: '',
    ready: false,
  }),

  getters: {
    /** Baris footer siap tampil. Kosong berarti pemanggil memakai text bawaannya. */
    footerText(state): string {
      if (!state.footerTemplate.trim()) return '';
      // `split/join` dipakai alih-alih `replaceAll` agar cocok dengan target
      // TS proyek (lib < es2021).
      return state.footerTemplate
        .split(':year')
        .join(String(new Date().getFullYear()))
        .split(':name')
        .join(state.appName);
    },
  },

  actions: {
    async bootstrap() {
      if (this.ready) return;
      try {
        const cfg = await apiGet<Record<string, string>>('/settings/public');
        this.apply(cfg ?? {});
      } catch {
        /* backend belum siap / offline — pakai bawaan */
      } finally {
        this.ready = true;
        this.applyToDocument();
      }
    },

    apply(cfg: Record<string, string>) {
      const code = (cfg['currency.code'] ?? '').toUpperCase();
      // Kode tak dikenal diabaikan — lebih baik due to default daripada
      // membuat Intl.NumberFormat melempar dan mematikan seluruh price.
      if (code && isSupportedCurrency(code)) this.currency = code;

      this.appName = (cfg['brand.app_name'] ?? '').trim() || DEFAULT_APP_NAME;
      this.footerTemplate = cfg['brand.footer'] ?? '';
      // Path relatif from backend diubah jadi URL absolut agar tetap termuat
      // ketika FE dan API beda origin.
      this.logoUrl = assetUrl(cfg['brand.logo_url'] ?? '');
      this.iconUrl = assetUrl(cfg['brand.icon_url'] ?? '');
    },

    /** Dipanggil layar settings setelah menyimpan, agar tampilan langsung ikut. */
    setCurrency(code: string) {
      if (isSupportedCurrency(code)) this.currency = code.toUpperCase();
    },

    setBrand(patch: Partial<{ appName: string; footerTemplate: string; logoUrl: string; iconUrl: string }>) {
      if (patch.appName !== undefined) this.appName = patch.appName.trim() || DEFAULT_APP_NAME;
      if (patch.footerTemplate !== undefined) this.footerTemplate = patch.footerTemplate;
      if (patch.logoUrl !== undefined) this.logoUrl = assetUrl(patch.logoUrl);
      if (patch.iconUrl !== undefined) this.iconUrl = assetUrl(patch.iconUrl);
      this.applyToDocument();
    },

    /** Terapkan name & ikon to title tab dan favicon. */
    applyToDocument() {
      if (typeof document === 'undefined') return;
      document.title = this.appName;
      if (!this.iconUrl) return;
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = this.iconUrl;
    },
  },
});
