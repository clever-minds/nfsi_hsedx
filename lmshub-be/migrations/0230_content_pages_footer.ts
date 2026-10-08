import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Halaman statis (About, Help Center, Privacy, Terms, Contact) menjadi bisa
 * dikelola dari Admin Panel dan dibaca oleh footer.
 *
 * Aditif: dua kolom baru di `content_pages`, tanpa mengubah kolom lama.
 *
 * Footer versi sebelumnya menautkan "About / Help Center / Privacy / Terms" ke
 * `#`. Supaya tautan itu langsung berguna setelah update, halaman bawaannya
 * diterbitkan dengan text awal yang singkat — tetapi HANYA bila halaman itu
 * masih placeholder yang belum pernah disentuh (draft, tanpa isi). Halaman yang
 * sudah ditulis pemilik tidak diubah sama sekali.
 *
 * Isi bawaan diberi penanda `seed` di JSON-nya. Penanda itu hilang begitu admin
 * menyimpan halaman, sehingga `down` hanya mengembalikan halaman yang masih
 * persis seperti yang ditulis migrasi ini.
 */

const SEED = 'lmshub-1.3.0';

const note =
  '<p><em>This is starter text. Edit it in Admin Panel → Website → Pages.</em></p>';

const PAGES: Array<{ slug: string; title: string; tipe: string; sort_order: number; html: string }> = [
  {
    slug: 'about-us',
    title: 'About Us',
    tipe: 'tentang',
    sort_order: 1,
    html: `<h2>About us</h2><p>We help people learn new skills through practical online courses taught by experienced instructors.</p>${note}`,
  },
  {
    slug: 'help-center',
    title: 'Help Center',
    tipe: 'faq',
    sort_order: 2,
    html:
      '<h2>Help Center</h2><h3>How do I enrol in a course?</h3><p>Open the course page and press <strong>Enrol</strong> or <strong>Buy</strong>. After payment is confirmed the course appears under <strong>My Courses</strong>.</p>' +
      '<h3>How do I get my certificate?</h3><p>Finish every required lesson (and pass the final exam if the course has one), then open <strong>My Certificates</strong>.</p>' +
      `<h3>Still need help?</h3><p>See the <a href="/pages/contact">Contact</a> page.</p>${note}`,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    tipe: 'kebijakan',
    sort_order: 3,
    html: `<h2>Privacy Policy</h2><p>This page explains what personal data we collect, why we collect it, and how you can contact us about it. Replace this text with your own policy.</p>${note}`,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    tipe: 'kebijakan',
    sort_order: 4,
    html: `<h2>Terms &amp; Conditions</h2><p>These terms govern the use of this learning platform. Replace this text with your own terms.</p>${note}`,
  },
  {
    slug: 'contact',
    title: 'Contact',
    tipe: 'halaman',
    sort_order: 5,
    html: `<h2>Contact us</h2><p>Questions about a course, a payment or your account? Reach us using the contact details shown at the top of this website.</p>${note}`,
  },
];

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE content_pages
      ADD COLUMN IF NOT EXISTS tampil_di_footer boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS urutan_footer smallint NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS content_pages_footer_idx ON content_pages (tampil_di_footer) WHERE deleted_at IS NULL;
  `);

  for (const p of PAGES) {
    const content = (inserted: boolean) =>
      lit(JSON.stringify({ format: 'html', html: p.html, seed: SEED, ...(inserted ? { seed_inserted: true } : {}) }));

    // Placeholder yang belum disentuh → terbitkan dengan text awal.
    pgm.sql(`
      UPDATE content_pages
         SET content = ${content(false)}::jsonb, status = 'terbit', tanggal_terbit = now(),
             tampil_di_footer = true, urutan_footer = ${p.sort_order}, updated_at = now()
       WHERE slug = ${lit(p.slug)} AND status = 'draft' AND content IS NULL AND deleted_at IS NULL;`);

    // Belum ada sama sekali → buat.
    pgm.sql(`
      INSERT INTO content_pages (slug, title, content, tipe, status, tanggal_terbit, tampil_di_footer, urutan_footer)
      SELECT ${lit(p.slug)}, ${lit(p.title)}, ${content(true)}::jsonb, ${lit(p.tipe)}::content_page_tipe, 'terbit', now(), true, ${p.sort_order}
       WHERE NOT EXISTS (SELECT 1 FROM content_pages WHERE slug = ${lit(p.slug)} AND deleted_at IS NULL);`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Halaman yang dibuat migrasi ini dan belum pernah disunting → hapus.
  pgm.sql(`
    DELETE FROM content_pages
     WHERE content->>'seed' = ${lit(SEED)} AND (content->>'seed_inserted')::boolean IS TRUE;`);
  // Placeholder lama yang diterbitkan migrasi ini → kembali menjadi draft kosong.
  pgm.sql(`
    UPDATE content_pages SET content = NULL, status = 'draft', tanggal_terbit = NULL, updated_at = now()
     WHERE content->>'seed' = ${lit(SEED)};`);
  pgm.sql(`
    DROP INDEX IF EXISTS content_pages_footer_idx;
    ALTER TABLE content_pages DROP COLUMN IF EXISTS urutan_footer, DROP COLUMN IF EXISTS tampil_di_footer;
  `);
}
