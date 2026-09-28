/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 11 — Keuangan & Laporan — domain finansial
 * kategori_biaya, financial_entries, report_snapshots, reviews.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE financial_entry_arah AS ENUM ('pemasukan','pengeluaran');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE laporan_jenis AS ENUM ('keuangan','operasional','kursus');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE laporan_status_publikasi AS ENUM ('draft','dipublikasi','diarsip');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── kategori_biaya ──
  pgm.sql(`
    CREATE TABLE kategori_biaya (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode            citext NOT NULL,
      nama            varchar(100) NOT NULL,
      jenis           financial_entry_arah NOT NULL,
      is_system       boolean NOT NULL DEFAULT false,
      deskripsi       text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX kategori_biaya_kode_uq ON kategori_biaya (kode) WHERE deleted_at IS NULL;
    CREATE INDEX kategori_biaya_jenis_idx ON kategori_biaya (jenis);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON kategori_biaya FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── financial_entries ──
  pgm.sql(`
    CREATE TABLE financial_entries (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      jenis               financial_entry_arah NOT NULL,
      kategori_id         uuid NOT NULL REFERENCES kategori_biaya(id) ON DELETE RESTRICT,
      course_id           uuid REFERENCES courses(id) ON DELETE SET NULL,
      nominal             numeric(18,2) NOT NULL,
      bukti               text,
      tanggal             date NOT NULL,
      periode_bulan       smallint NOT NULL,
      periode_tahun       smallint NOT NULL,
      deskripsi           text,
      dicatat_oleh        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      sumber_type         varchar(30),
      sumber_id           uuid,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT financial_entries_nominal_chk CHECK (nominal >= 0),
      CONSTRAINT financial_entries_bulan_chk CHECK (periode_bulan BETWEEN 1 AND 12),
      CONSTRAINT financial_entries_tahun_chk CHECK (periode_tahun BETWEEN 2000 AND 2100),
      CONSTRAINT financial_entries_sumber_type_chk CHECK (
        sumber_type IS NULL OR sumber_type IN ('order','payment','instructor_payout','commission','refund')
      )
    );
    CREATE UNIQUE INDEX financial_entries_sumber_uq ON financial_entries (sumber_type, sumber_id)
      WHERE sumber_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX financial_entries_jenis_idx ON financial_entries (jenis);
    CREATE INDEX financial_entries_kategori_idx ON financial_entries (kategori_id);
    CREATE INDEX financial_entries_course_idx ON financial_entries (course_id);
    CREATE INDEX financial_entries_tanggal_idx ON financial_entries (tanggal);
    CREATE INDEX financial_entries_periode_idx ON financial_entries (periode_tahun, periode_bulan);
    CREATE INDEX financial_entries_dicatat_oleh_idx ON financial_entries (dicatat_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── report_snapshots ──
  pgm.sql(`
    CREATE TABLE report_snapshots (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      judul                   varchar(200) NOT NULL,
      jenis_laporan           laporan_jenis NOT NULL,
      periode_mulai           date NOT NULL,
      periode_selesai         date NOT NULL,
      data                    jsonb NOT NULL,
      course_id               uuid REFERENCES courses(id) ON DELETE SET NULL,
      status_publikasi        laporan_status_publikasi NOT NULL DEFAULT 'draft',
      dipublikasi_oleh        uuid REFERENCES users(id) ON DELETE SET NULL,
      tanggal_publikasi       timestamptz,
      dibuat_oleh             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT report_snapshots_periode_chk CHECK (periode_selesai >= periode_mulai),
      CONSTRAINT report_snapshots_publikasi_chk CHECK (
        status_publikasi <> 'dipublikasi' OR (dipublikasi_oleh IS NOT NULL AND tanggal_publikasi IS NOT NULL)
      )
    );
    CREATE INDEX report_snapshots_jenis_idx ON report_snapshots (jenis_laporan);
    CREATE INDEX report_snapshots_periode_mulai_idx ON report_snapshots (periode_mulai);
    CREATE INDEX report_snapshots_periode_selesai_idx ON report_snapshots (periode_selesai);
    CREATE INDEX report_snapshots_course_idx ON report_snapshots (course_id);
    CREATE INDEX report_snapshots_status_idx ON report_snapshots (status_publikasi);
    CREATE INDEX report_snapshots_dipublikasi_oleh_idx ON report_snapshots (dipublikasi_oleh);
    CREATE INDEX report_snapshots_dibuat_oleh_idx ON report_snapshots (dibuat_oleh);
    CREATE INDEX report_snapshots_data_gin_idx ON report_snapshots USING GIN (data);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reviews ──
  pgm.sql(`
    CREATE TABLE reviews (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      rating              smallint NOT NULL,
      ulasan              text,
      is_hidden           boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
    );
    CREATE UNIQUE INDEX reviews_enrollment_uq ON reviews (enrollment_id) WHERE deleted_at IS NULL;
    CREATE INDEX reviews_user_idx ON reviews (user_id);
    CREATE INDEX reviews_course_idx ON reviews (course_id);
    CREATE INDEX reviews_rating_idx ON reviews (rating);
    CREATE INDEX reviews_is_hidden_idx ON reviews (is_hidden);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed kategori biaya sistem ──
  pgm.sql(`
    INSERT INTO kategori_biaya (kode, nama, jenis, is_system) VALUES
      ('penjualan_kursus', 'Penjualan Kursus', 'pemasukan', true),
      ('langganan', 'Langganan/Membership', 'pemasukan', true),
      ('payout_instruktur', 'Payout Instruktur', 'pengeluaran', true),
      ('komisi_marketing', 'Komisi Marketing', 'pengeluaran', true),
      ('refund', 'Refund', 'pengeluaran', true),
      ('operasional', 'Operasional', 'pengeluaran', true),
      ('pemasaran', 'Pemasaran', 'pengeluaran', true),
      ('lainnya', 'Lainnya', 'pengeluaran', true)
    ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS reviews;`);
  pgm.sql(`DROP TABLE IF EXISTS report_snapshots;`);
  pgm.sql(`DROP TABLE IF EXISTS financial_entries;`);
  pgm.sql(`DROP TABLE IF EXISTS kategori_biaya;`);
  pgm.sql(`DROP TYPE IF EXISTS laporan_status_publikasi;`);
  pgm.sql(`DROP TYPE IF EXISTS laporan_jenis;`);
  pgm.sql(`DROP TYPE IF EXISTS financial_entry_arah;`);
}
