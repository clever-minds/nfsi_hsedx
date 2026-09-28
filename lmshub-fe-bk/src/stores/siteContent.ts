import { defineStore } from 'pinia';
import { apiGet } from '@/lib/api';
import { DEFAULT_SITE_CONTENT, SECTION_KEYS, type SectionItem, type SiteContent } from '@/lib/site-content';

/**
 * Isi halaman publik yang dikelola lewat menu Website.
 *
 * Dimuat sekali saat aplikasi start, berbarengan dengan `appConfig`: header dan
 * footer digambar di setiap halaman, jadi menundanya sampai halaman depan
 * dibuka hanya akan membuat kontak dan tautan berkedip.
 */
export const useSiteContentStore = defineStore('siteContent', {
  state: () => ({
    konten: structuredClone(DEFAULT_SITE_CONTENT) as SiteContent,
    ready: false,
  }),

  getters: {
    kontak: (s) => s.konten.kontak,
    hero: (s) => s.konten.hero,
    footer: (s) => s.konten.footer,
    /** Sosmed yang aktif dan punya tautan. */
    sosialAktif: (s) => s.konten.sosial.filter((x) => x.aktif && x.url.trim()),
    /** Menu header kustom; kosong berarti pemanggil memakai menu bawaan. */
    menuAktif: (s) => s.konten.menu.filter((m) => m.aktif && m.url.trim()),

    /** Seksi halaman depan yang aktif, sudah urut sesuai susunan admin. */
    sectionsAktif: (s) => s.konten.sections.filter((x) => x.aktif),
  },

  actions: {
    async bootstrap() {
      if (this.ready) return;
      try {
        const data = await apiGet<SiteContent>('/site-content');
        if (data) this.apply(data);
      } catch {
        /* backend belum siap / offline — pakai tampilan bawaan */
      } finally {
        this.ready = true;
      }
    },

    apply(data: SiteContent) {
      // Seksi tak dikenal dibuang: kunci yang tidak punya komponen tidak akan
      // pernah tergambar, dan membiarkannya hanya membingungkan urutan.
      const sections = (data.sections ?? []).filter((x) => (SECTION_KEYS as readonly string[]).includes(x.key));
      this.konten = { ...DEFAULT_SITE_CONTENT, ...data, sections };
    },

    /** Dipanggil layar Website setelah menyimpan, agar tampilan langsung ikut. */
    patch<K extends keyof SiteContent>(key: K, nilai: SiteContent[K]) {
      this.konten = { ...this.konten, [key]: nilai };
    },

    /** Pengaturan satu seksi halaman depan; `undefined` bila belum tersimpan. */
    section(key: string): SectionItem | undefined {
      return this.konten.sections.find((x) => x.key === key);
    },
  },
});
