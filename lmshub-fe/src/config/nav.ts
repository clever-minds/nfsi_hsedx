export interface NavItem {
  /** Kunci i18n label (namespace `nav`), diterjemahkan saat render. */
  labelKey: string;
  to: string;
  permission?: string; // gating v-can; kosong = tampil untuk semua terautentikasi
  /** Hanya tampil bila pengguna memiliki salah satu peran ini (allowlist). */
  roles?: string[];
  /** Sembunyikan bila pengguna memiliki salah satu peran ini (blocklist, menang atas permission). */
  hideForRoles?: string[];
  icon?: string; // name ikon di components/ui/Icon.vue
}

/** Kelompok navigasi dengan title seksi (uppercase) ala sidebar Cursus/CSHub. */
export interface NavSection {
  /** Kunci i18n title seksi (namespace `nav`). */
  titleKey: string;
  items: NavItem[];
}

/**
 * Navigasi dashboard dikelompokkan per seksi. Judul seksi hanya tampil bila
 * seksi tersebut punya minimal satu item yang lolos gating izin.
 *
 * Label disimpan sebagai kunci i18n, bukan text — DashboardLayout yang
 * menerjemahkannya, sehingga menu ikut berganti saat language diganti.
 */
export const navSections: NavSection[] = [
  {
    titleKey: 'nav.section.home',
    items: [
      { labelKey: 'nav.item.home', to: '/d', icon: 'home' },
      { labelKey: 'nav.item.catalog', to: '/d/catalog', icon: 'compass' },
    ],
  },
  {
    titleKey: 'nav.section.learning',
    items: [
      // Halaman manajemen (assign manual, cohort). Student memakai "Belajar Saya".
      // Instructor boleh lihat peserta kursusnya (view, BE row-scoped), tapi student/sub_user tidak.
      {
        labelKey: 'nav.item.enrollment',
        to: '/d/enrollment',
        permission: 'enrollment.view',
        hideForRoles: ['student', 'sub_user'],
        icon: 'clipboard',
      },
      // Halaman swalayan (isinya milik pengguna sendiri) memakai ALLOWLIST,
      // bukan `hideForRoles`. Blocklist harus menyebut setiap peran manajemen
      // satu per satu, jadi satu peran yang belum terdaftar langsung ikut
      // melihatnya. Allowlist gagal ke arah aman: peran baru tidak otomatis
      // kebagian halaman pribadi.
      {
        labelKey: 'nav.item.myLearning',
        to: '/d/learn',
        permission: 'enrollment.view',
        roles: ['student', 'sub_user', 'instructor', 'asisten'],
        icon: 'play-circle',
      },
      { labelKey: 'nav.item.assessments', to: '/d/assessments', permission: 'assessment.view', icon: 'check-square' },
      { labelKey: 'nav.item.liveClass', to: '/d/live-class', permission: 'live_class.view', icon: 'video' },
      { labelKey: 'nav.item.discussions', to: '/d/discussions', permission: 'diskusi.view', icon: 'message-circle' },
      // "Certificate Saya" juga swalayan — alasan yang sama seperti di atas.
      {
        labelKey: 'nav.item.certificates',
        to: '/d/certificates',
        permission: 'certificate.view',
        roles: ['student', 'sub_user', 'instructor', 'asisten'],
        icon: 'award',
      },
    ],
  },
  {
    titleKey: 'nav.section.teaching',
    items: [
      // Manajemen course — khusus instructor/admin (student punya course.view untuk catalog, bukan kelola).
      { labelKey: 'nav.item.courses', to: '/d/courses', permission: 'course.create', icon: 'book-open' },
      // Master data kategori & tag. Berada di atas Kurikulum karena course tidak
      // bisa dibuat sebelum ada minimal satu kategori (`category_id` NOT NULL).
      // Gerbangnya `kategori.create` — `kategori.view` juga dimiliki student.
      { labelKey: 'nav.item.categories', to: '/d/categories', permission: 'kategori.create', icon: 'tag' },
      { labelKey: 'nav.item.curriculum', to: '/d/curriculum', permission: 'kurikulum.view', icon: 'layers' },
      // Uploaded videos, audio, images and PDFs that lessons play from this server.
      { labelKey: 'nav.item.mediaLibrary', to: '/d/media', permission: 'content.view', icon: 'film' },
      { labelKey: 'nav.item.grading', to: '/d/grading', permission: 'grading.view', icon: 'grid' },
    ],
  },
  {
    titleKey: 'nav.section.management',
    items: [
      { labelKey: 'nav.item.users', to: '/d/users', permission: 'pengguna.view', icon: 'users' },
      { labelKey: 'nav.item.transactions', to: '/d/transactions', permission: 'transaction.view', icon: 'credit-card' },
      { labelKey: 'nav.item.marketing', to: '/d/marketing', permission: 'marketing.view', icon: 'megaphone' },
      // Kode kupon checkout. Berdiri sendiri, bukan tab di Marketing, karena
      // yang mengurusnya sering admin penjualan dan bukan tim afiliasi.
      { labelKey: 'nav.item.coupons', to: '/d/marketing/coupons', permission: 'marketing.view', icon: 'tag' },
    ],
  },
  {
    titleKey: 'nav.section.reports',
    items: [
      { labelKey: 'nav.item.reports', to: '/d/reports', permission: 'laporan.view', icon: 'bar-chart' },
      { labelKey: 'nav.item.notifications', to: '/d/notifications', permission: 'notifikasi.view', icon: 'bell' },
      { labelKey: 'nav.item.auditLog', to: '/d/audit', permission: 'audit.view', icon: 'file-text' },
    ],
  },
  {
    titleKey: 'nav.section.settings',
    items: [
      { labelKey: 'nav.item.settings', to: '/d/settings', permission: 'pengaturan.view', icon: 'settings' },
      // Editor template certificate sebelumnya tidak ditaut dari mana pun.
      // Gerbangnya `certificate.create`, BUKAN `certificate.view` — izin view juga
      // dimiliki student, jadi memakainya akan membuka halaman admin untuk mereka.
      {
        labelKey: 'nav.item.certificateTemplate',
        to: '/d/certificates/templates',
        permission: 'certificate.create',
        icon: 'award',
      },
      // Isi halaman publik — terpisah dari Pengaturan karena yang diubah adalah
      // tampilan untuk pengunjung, bukan perilaku sistem.
      { labelKey: 'nav.item.website', to: '/d/website', permission: 'pengaturan.view', icon: 'layout' },
      // Halaman statis yang ditautkan footer (About, Terms, Privacy, …).
      { labelKey: 'nav.item.pages', to: '/d/website/pages', permission: 'pengaturan.view', icon: 'file-text' },
      // Master data mata uang tampilan + kurs terhadap mata uang basis.
      {
        labelKey: 'nav.item.currencies',
        to: '/d/settings/currencies',
        permission: 'pengaturan.view',
        icon: 'dollar-sign',
      },
      // Master data rekening transfer manual (sebelumnya tiga baris di Pengaturan).
      {
        labelKey: 'nav.item.bankAccounts',
        to: '/d/settings/bank-accounts',
        permission: 'pengaturan.view',
        icon: 'credit-card',
      },
    ],
  },
];

/** Daftar datar semua item (kompat mundur bila ada yang mengimpor navItems). */
export const navItems: NavItem[] = navSections.flatMap((s) => s.items);
