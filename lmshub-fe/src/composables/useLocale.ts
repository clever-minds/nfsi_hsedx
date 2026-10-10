import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_LIST, LOCALES, setLocale, type SupportedLocale } from '@/i18n';

/**
 * Akses locale active + register language untuk komponen pemilih language.
 * `isRtl` berguna untuk membalik ikon arah (panah, chevron) yang no
 * tercakup by CSS logical properties.
 */
export function useLocale() {
  const { locale } = useI18n();

  const current = computed<SupportedLocale>(() => locale.value as SupportedLocale);
  const currentDef = computed(() => LOCALES[current.value]);
  const isRtl = computed(() => currentDef.value.dir === 'rtl');

  return {
    locale: current,
    currentDef,
    isRtl,
    locales: LOCALE_LIST,
    setLocale,
  };
}
