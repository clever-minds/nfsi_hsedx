export interface NavItem {
  /** Kunci i18n label (namespace `nav`), diterjemahkan saat render. */
  labelKey: string;
  to: string;
  permission?: string; // gating v-can; kosong = tampil untuk semua terautentikasi
  /** Hanya tampil bila pengguna memiliki salah satu peran ini (allowlist). */
  roles?: string[];
  /** Sembunyikan bila pengguna memiliki salah satu peran ini (blocklist, menang atas permission). */
  hideForRoles?: string[];
  icon?: string; // nama ikon di components/ui/Icon.vue
}

/** Kelompok navigasi dengan judul seksi (uppercase) ala sidebar Cursus/CSHub. */
export interface NavSection {
  /** Kunci i18n judul seksi (namespace `nav`). */
  titleKey: string;
  items: NavItem[];
}

/**
 * Navigasi dashboard dikelompokkan per seksi. Judul seksi hanya tampil bila
 * seksi tersebut punya minimal satu item yang lolos gating izin.
 *
 * Label disimpan sebagai kunci i18n, bukan teks — DashboardLayout yang
 * menerjemahkannya, sehingga menu ikut berganti saat bahasa diganti.
 */
export const navSections: NavSection[] = [
  {
    titleKey: 'nav.section.home',
    items: [
      { labelKey: 'nav.item.home', to: '/d', icon: 'home' },
      { labelKey: 'nav.item.catalog', to: '/d/katalog', icon: 'compass' },
    ],
  },
  {
    titleKey: 'nav.section.learning',
    items: [
      // Halaman manajemen (assign manual, cohort). Siswa memakai "Belajar Saya".
      // Instruktur boleh lihat peserta kursusnya (view, BE row-scoped), tapi siswa/sub_user tidak.
      {
        labelKey: 'nav.item.enrollment',
        to: '/d/enrollment',
        permission: 'enrollment.view',
        hideForRoles: ['siswa', 'sub_user'],
        icon: 'clipboard',
      },
      // Halaman swalayan (isinya milik pengguna sendiri) memakai ALLOWLIST,
      // bukan `hideForRoles`. Blocklist harus menyebut setiap peran manajemen
      // satu per satu, jadi satu peran yang belum terdaftar langsung ikut
      // melihatnya. Allowlist gagal ke arah aman: peran baru tidak otomatis
      // kebagian halaman pribadi.
      {
        labelKey: 'nav.item.myLearning',
        to: '/d/belajar',
        permission: 'enrollment.view',
        roles: ['siswa', 'sub_user', 'instruktur', 'asisten'],
        icon: 'play-circle',
      },
      { labelKey: 'nav.item.assessments', to: '/d/asesmen', permission: 'asesmen.view', icon: 'check-square' },
      { labelKey: 'nav.item.liveClass', to: '/d/live-class', permission: 'live_class.view', icon: 'video' },
      { labelKey: 'nav.item.discussions', to: '/d/diskusi', permission: 'diskusi.view', icon: 'message-circle' },
      // "Sertifikat Saya" juga swalayan — alasan yang sama seperti di atas.
      {
        labelKey: 'nav.item.certificates',
        to: '/d/sertifikat',
        permission: 'sertifikat.view',
        roles: ['siswa', 'sub_user', 'instruktur', 'asisten'],
        icon: 'award',
      },
    ],
  },
  {
    titleKey: 'nav.section.teaching',
    items: [
      // Manajemen kursus — khusus instruktur/admin (siswa punya kursus.view untuk katalog, bukan kelola).
      { labelKey: 'nav.item.courses', to: '/d/kursus', permission: 'kursus.create', icon: 'book-open' },
      { labelKey: 'nav.item.curriculum', to: '/d/konten', permission: 'kurikulum.view', icon: 'layers' },
      { labelKey: 'nav.item.grading', to: '/d/grading', permission: 'grading.view', icon: 'grid' },
    ],
  },
  {
    titleKey: 'nav.section.management',
    items: [
      { labelKey: 'nav.item.users', to: '/d/pengguna', permission: 'pengguna.view', icon: 'users' },
      { labelKey: 'nav.item.transactions', to: '/d/transaksi', permission: 'transaksi.view', icon: 'credit-card' },
      { labelKey: 'nav.item.marketing', to: '/d/marketing', permission: 'marketing.view', icon: 'megaphone' },
    ],
  },
  {
    titleKey: 'nav.section.reports',
    items: [
      { labelKey: 'nav.item.reports', to: '/d/laporan', permission: 'laporan.view', icon: 'bar-chart' },
      { labelKey: 'nav.item.notifications', to: '/d/notifikasi', permission: 'notifikasi.view', icon: 'bell' },
      { labelKey: 'nav.item.auditLog', to: '/d/audit', permission: 'audit.view', icon: 'file-text' },
    ],
  },
  {
    titleKey: 'nav.section.settings',
    items: [
      { labelKey: 'nav.item.settings', to: '/d/pengaturan', permission: 'pengaturan.view', icon: 'settings' },
      // Editor template sertifikat sebelumnya tidak ditaut dari mana pun.
      // Gerbangnya `sertifikat.create`, BUKAN `sertifikat.view` — izin view juga
      // dimiliki siswa, jadi memakainya akan membuka halaman admin untuk mereka.
      {
        labelKey: 'nav.item.certificateTemplate',
        to: '/d/sertifikat/template',
        permission: 'sertifikat.create',
        icon: 'award',
      },
      // Isi halaman publik — terpisah dari Pengaturan karena yang diubah adalah
      // tampilan untuk pengunjung, bukan perilaku sistem.
      { labelKey: 'nav.item.website', to: '/d/website', permission: 'pengaturan.view', icon: 'layout' },
      // Master data mata uang tampilan + kurs terhadap mata uang basis.
      {
        labelKey: 'nav.item.currencies',
        to: '/d/pengaturan/mata-uang',
        permission: 'pengaturan.view',
        icon: 'dollar-sign',
      },
      // Master data rekening transfer manual (sebelumnya tiga baris di Pengaturan).
      {
        labelKey: 'nav.item.bankAccounts',
        to: '/d/pengaturan/rekening',
        permission: 'pengaturan.view',
        icon: 'credit-card',
      },
    ],
  },
];

/** Daftar datar semua item (kompat mundur bila ada yang mengimpor navItems). */
export const navItems: NavItem[] = navSections.flatMap((s) => s.items);
