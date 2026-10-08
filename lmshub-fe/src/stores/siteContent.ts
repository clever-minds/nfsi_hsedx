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
/** Halaman statis terbit (About, Terms, …) — tanpa isinya, cukup untuk tautan. */
export interface PublicPageLink {
  slug: string;
  title: string;
  tipe: string;
  tampil_di_footer: boolean;
  urutan_footer: number;
}

export const useSiteContentStore = defineStore('siteContent', {
  state: () => ({
    content: structuredClone(DEFAULT_SITE_CONTENT) as SiteContent,
    /** Diisi dari `GET /public/pages`; kosong pada backend lama yang belum punya endpoint itu. */
    halaman: [] as PublicPageLink[],
    ready: false,
  }),

  getters: {
    kontak: (s) => s.content.kontak,
    hero: (s) => s.content.hero,
    footer: (s) => s.content.footer,
    /** Sosmed yang aktif dan punya tautan. */
    sosialAktif: (s) => s.content.sosial.filter((x) => x.aktif && x.url.trim()),
    /** Menu header kustom; kosong berarti pemanggil memakai menu bawaan. */
    menuAktif: (s) => s.content.menu.filter((m) => m.aktif && m.url.trim()),

    /** Seksi halaman depan yang aktif, sudah urut sesuai susunan admin. */
    sectionsAktif: (s) => s.content.sections.filter((x) => x.aktif),

    /** Halaman yang admin tandai "tampil di footer", sesuai urutannya. */
    halamanFooter: (s) =>
      s.halaman.filter((p) => p.tampil_di_footer).sort((a, b) => a.urutan_footer - b.urutan_footer),
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

    /** Dipanggil juga oleh layar Pages setelah menyimpan, agar footer langsung ikut. */
    async loadHalaman() {
      try {
        this.halaman = (await apiGet<PublicPageLink[]>('/public/pages')) ?? [];
      } catch {
        this.halaman = [];
      }
    },

    apply(data: SiteContent) {
      // Seksi tak dikenal dibuang: kunci yang tidak punya komponen tidak akan
      // pernah tergambar, dan membiarkannya hanya membingungkan sort_order.
      const sections = (data.sections ?? []).filter((x) => (SECTION_KEYS as readonly string[]).includes(x.key));
      this.content = { ...DEFAULT_SITE_CONTENT, ...data, sections };
    },

    /** Dipanggil layar Website setelah menyimpan, agar tampilan langsung ikut. */
    patch<K extends keyof SiteContent>(key: K, nilai: SiteContent[K]) {
      this.content = { ...this.content, [key]: nilai };
    },

    /** Pengaturan satu seksi halaman depan; `undefined` bila belum tersimpan. */
    section(key: string): SectionItem | undefined {
      return this.content.sections.find((x) => x.key === key);
    },
  },
});
