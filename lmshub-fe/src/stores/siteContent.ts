import { defineStore } from 'pinia';
import { apiGet } from '@/lib/api';
import { DEFAULT_SITE_CONTENT, SECTION_KEYS, type SectionItem, type SiteContent } from '@/lib/site-content';

/**
 * Isi halaman publik yang managed lewat menu Website.
 *
 * Dimuat sekali saat aplikasi start, berbarengan dengan `appConfig`: header dan
 * footer digambar di setiap halaman, jadi menundanya until halaman depan
 * dibuka hanya akan membuat kontak dan tautan berkedip.
 */
/** Halaman statis publish (About, Terms, …) — tanpa isinya, cukup untuk tautan. */
export interface PublicPageLink {
  slug: string;
  title: string;
  type: string;
  show_in_footer: boolean;
  footer_sort_order: number;
}

export const useSiteContentStore = defineStore('siteContent', {
  state: () => ({
    content: structuredClone(DEFAULT_SITE_CONTENT) as SiteContent,
    /** Diisi from `GET /public/pages`; kosong pada backend lama yang belum punya endpointst itu. */
    halaman: [] as PublicPageLink[],
    ready: false,
  }),

  getters: {
    kontak: (s) => s.content.kontak,
    hero: (s) => s.content.hero,
    footer: (s) => s.content.footer,
    /** Sosmed yang active dan punya tautan. */
    sosialAktif: (s) => s.content.sosial.filter((x) => x.active && x.url.trim()),
    /** Menu header kustom; kosong berarti pemanggil memakai menu bawaan. */
    menuAktif: (s) => s.content.menu.filter((m) => m.active && m.url.trim()),

    /** Seksi halaman depan yang active, sudah sort_order sesuai susunan admin. */
    sectionsAktif: (s) => s.content.sections.filter((x) => x.active),

    /** Halaman yang admin tandai "tampil di footer", sesuai sort_orderannya. */
    halamanFooter: (s) =>
      s.halaman.filter((p) => p.show_in_footer).sort((a, b) => a.footer_sort_order - b.footer_sort_order),
  },

  actions: {
    async bootstrap() {
      if (this.ready) return;
      await Promise.all([
        apiGet<SiteContent>('/site-content')
          .then((data) => data && this.apply(data))
          .catch(() => {
            /* backend belum siap / offline — pakai tampilan bawaan */
          }),
        this.loadHalaman(),
      ]);
      this.ready = true;
    },

    /** Dipanggil juga by layar Pages setelah menyimpan, agar footer langsung ikut. */
    async loadHalaman() {
      try {
        this.halaman = (await apiGet<PublicPageLink[]>('/public/pages')) ?? [];
      } catch {
        this.halaman = [];
      }
    },

    apply(data: SiteContent) {
      // Seksi tak dikenal dibuang: kunci yang no punya komponen no akan
      // pernah tergambar, dan membiarkannya hanya membingungkan sort_order.
      const sections = (data.sections ?? []).filter((x) => (SECTION_KEYS as readonly string[]).includes(x.key));
      this.content = { ...DEFAULT_SITE_CONTENT, ...data, sections };
    },

    /** Dipanggil layar Website setelah menyimpan, agar tampilan langsung ikut. */
    patch<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
      this.content = { ...this.content, [key]: value };
    },

    /** settings satu seksi halaman depan; `undefined` bila belum tersimpan. */
    section(key: string): SectionItem | undefined {
      return this.content.sections.find((x) => x.key === key);
    },
  },
});
