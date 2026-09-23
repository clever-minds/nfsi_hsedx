/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 05 — Transaksi & Pembayaran — domain finansial
 * coupons, orders, order_items, payments, invoices, subscriptions, memberships, refunds,
 * revenue_shares, instructor_payouts.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_jalur AS ENUM ('online','manual');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_status AS ENUM
      ('menunggu_pembayaran','dp_cicilan_berjalan','lunas','akses_aktif','batal');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_item_tipe AS ENUM ('kursus','bundle','path','langganan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payment_jenis AS ENUM ('penuh','dp','cicilan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('menunggu_verifikasi','terverifikasi','ditolak');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('aktif','nonaktif','kedaluwarsa','dibatalkan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE refund_status AS ENUM ('diajukan','disetujui','ditolak','diproses','selesai');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payout_status AS ENUM ('dihitung','menunggu_approval','disetujui','pencairan','selesai');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── coupons (dibuat lebih awal — direferensikan orders) ──
  pgm.sql(`
    CREATE TABLE coupons (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode                  citext NOT NULL,
      tipe_potongan         varchar(10) NOT NULL,
      nilai_potongan        numeric(18,2) NOT NULL,
      kuota_maksimal        integer,
      kuota_terpakai        integer NOT NULL DEFAULT 0,
      minimum_pembelian     numeric(18,2),
      berlaku_mulai         timestamptz,
      berlaku_sampai        timestamptz,
      is_aktif              boolean NOT NULL DEFAULT true,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT coupons_tipe_potongan_chk CHECK (tipe_potongan IN ('persen','nominal')),
      CONSTRAINT coupons_nilai_potongan_chk CHECK (nilai_potongan >= 0)
    );
    CREATE UNIQUE INDEX coupons_kode_uq ON coupons (kode) WHERE deleted_at IS NULL;
    CREATE INDEX coupons_berlaku_sampai_idx ON coupons (berlaku_sampai);
    CREATE INDEX coupons_is_aktif_idx ON coupons (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── orders ──
  pgm.sql(`
    CREATE TABLE orders (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_user_id               uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      jalur                       order_jalur NOT NULL,
      marketing_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
      status                      order_status NOT NULL DEFAULT 'menunggu_pembayaran',
      coupon_id                   uuid REFERENCES coupons(id) ON DELETE SET NULL,
      subtotal                    numeric(18,2) NOT NULL DEFAULT 0,
      diskon                      numeric(18,2) NOT NULL DEFAULT 0,
      total                       numeric(18,2) NOT NULL DEFAULT 0,
      checkout_kedaluwarsa_at     timestamptz,
      catatan                     text,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT orders_subtotal_chk CHECK (subtotal >= 0),
      CONSTRAINT orders_diskon_chk CHECK (diskon >= 0),
      CONSTRAINT orders_total_chk CHECK (total >= 0)
    );
    CREATE INDEX orders_buyer_idx ON orders (buyer_user_id);
    CREATE INDEX orders_jalur_idx ON orders (jalur);
    CREATE INDEX orders_marketing_idx ON orders (marketing_user_id);
    CREATE INDEX orders_status_idx ON orders (status);
    CREATE INDEX orders_coupon_idx ON orders (coupon_id);
    CREATE INDEX orders_checkout_kedaluwarsa_idx ON orders (checkout_kedaluwarsa_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── order_items (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE order_items (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_tipe             order_item_tipe NOT NULL,
      course_id             uuid REFERENCES courses(id) ON DELETE RESTRICT,
      learning_path_id      uuid REFERENCES learning_paths(id) ON DELETE RESTRICT,
      bundle_group_id       uuid,
      harga_satuan          numeric(18,2) NOT NULL,
      kuantitas             integer NOT NULL DEFAULT 1,
      subtotal              numeric(18,2) NOT NULL,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT order_items_harga_satuan_chk CHECK (harga_satuan >= 0),
      CONSTRAINT order_items_kuantitas_chk CHECK (kuantitas > 0),
      CONSTRAINT order_items_subtotal_chk CHECK (subtotal >= 0),
      CONSTRAINT order_items_tipe_kombinasi_chk CHECK (
        (item_tipe IN ('kursus','bundle') AND course_id IS NOT NULL) OR
        (item_tipe = 'path' AND learning_path_id IS NOT NULL) OR
        (item_tipe = 'langganan' AND course_id IS NULL AND learning_path_id IS NULL)
      )
    );
    CREATE INDEX order_items_order_idx ON order_items (order_id);
    CREATE INDEX order_items_item_tipe_idx ON order_items (item_tipe);
    CREATE INDEX order_items_course_idx ON order_items (course_id);
    CREATE INDEX order_items_learning_path_idx ON order_items (learning_path_id);
    CREATE INDEX order_items_bundle_group_idx ON order_items (bundle_group_id);
  `);

  // ── payments ──
  pgm.sql(`
    CREATE TABLE payments (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                  uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      jenis                     payment_jenis NOT NULL,
      nominal                   numeric(18,2) NOT NULL,
      metode                    varchar(30) NOT NULL,
      status                    payment_status NOT NULL DEFAULT 'menunggu_verifikasi',
      bukti_media_id            uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      referensi_gateway         varchar(150),
      verified_by               uuid REFERENCES users(id) ON DELETE SET NULL,
      verified_at               timestamptz,
      catatan_verifikasi        text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT payments_nominal_chk CHECK (nominal > 0)
    );
    CREATE UNIQUE INDEX payments_referensi_gateway_uq ON payments (referensi_gateway) WHERE referensi_gateway IS NOT NULL;
    CREATE INDEX payments_order_idx ON payments (order_id);
    CREATE INDEX payments_jenis_idx ON payments (jenis);
    CREATE INDEX payments_metode_idx ON payments (metode);
    CREATE INDEX payments_status_idx ON payments (status);
    CREATE INDEX payments_bukti_media_idx ON payments (bukti_media_id);
    CREATE INDEX payments_verified_by_idx ON payments (verified_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── invoices ──
  pgm.sql(`
    CREATE TABLE invoices (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      nomor_invoice       varchar(50) NOT NULL,
      pdf_media_id        uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      diterbitkan_at      timestamptz NOT NULL DEFAULT now(),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz
    );
    CREATE UNIQUE INDEX invoices_nomor_uq ON invoices (nomor_invoice);
    CREATE INDEX invoices_order_idx ON invoices (order_id);
    CREATE INDEX invoices_pdf_media_idx ON invoices (pdf_media_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── subscriptions & memberships (digabung — model monetisasi tambahan) ──
  pgm.sql(`
    CREATE TABLE subscriptions (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id                  uuid REFERENCES orders(id) ON DELETE SET NULL,
      paket                     varchar(100) NOT NULL,
      periode                   varchar(20) NOT NULL,
      status                    subscription_status NOT NULL DEFAULT 'aktif',
      mulai_at                  timestamptz NOT NULL,
      berakhir_at               timestamptz NOT NULL,
      perpanjangan_otomatis     boolean NOT NULL DEFAULT false,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT subscriptions_periode_chk CHECK (periode IN ('bulanan','tahunan'))
    );
    CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);
    CREATE INDEX subscriptions_order_idx ON subscriptions (order_id);
    CREATE INDEX subscriptions_status_idx ON subscriptions (status);
    CREATE INDEX subscriptions_berakhir_idx ON subscriptions (berakhir_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE memberships (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id   uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
      akses_scope       varchar(20) NOT NULL DEFAULT 'semua_kursus',
      scope_ref_id      uuid,
      mulai_at          timestamptz NOT NULL,
      berakhir_at       timestamptz,
      is_aktif          boolean NOT NULL DEFAULT true,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      CONSTRAINT memberships_scope_chk CHECK (akses_scope IN ('semua_kursus','kategori','path'))
    );
    CREATE INDEX memberships_user_idx ON memberships (user_id);
    CREATE INDEX memberships_subscription_idx ON memberships (subscription_id);
    CREATE INDEX memberships_scope_idx ON memberships (akses_scope);
    CREATE INDEX memberships_scope_ref_idx ON memberships (scope_ref_id);
    CREATE INDEX memberships_is_aktif_idx ON memberships (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── refunds ──
  pgm.sql(`
    CREATE TABLE refunds (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                  uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      nominal                   numeric(18,2) NOT NULL,
      alasan                    text NOT NULL,
      status                    refund_status NOT NULL DEFAULT 'diajukan',
      diajukan_oleh             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      disetujui_oleh            uuid REFERENCES users(id) ON DELETE SET NULL,
      disetujui_at              timestamptz,
      diproses_at               timestamptz,
      metode_pengembalian       varchar(30),
      catatan                   text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT refunds_nominal_chk CHECK (nominal > 0)
    );
    CREATE INDEX refunds_order_idx ON refunds (order_id);
    CREATE INDEX refunds_status_idx ON refunds (status);
    CREATE INDEX refunds_diajukan_oleh_idx ON refunds (diajukan_oleh);
    CREATE INDEX refunds_disetujui_oleh_idx ON refunds (disetujui_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── revenue_shares (tanpa instructor_payout_id — ditambah setelah instructor_payouts ada) ──
  pgm.sql(`
    CREATE TABLE revenue_shares (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id             uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      instructor_id         uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      order_item_id         uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
      persen_share          numeric(5,2) NOT NULL,
      nominal_share         numeric(18,2) NOT NULL,
      nominal_platform      numeric(18,2) NOT NULL,
      periode               varchar(7) NOT NULL,
      status                varchar(20) NOT NULL DEFAULT 'dihitung',
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT revenue_shares_persen_chk CHECK (persen_share BETWEEN 0 AND 100),
      CONSTRAINT revenue_shares_nominal_share_chk CHECK (nominal_share >= 0),
      CONSTRAINT revenue_shares_nominal_platform_chk CHECK (nominal_platform >= 0),
      CONSTRAINT revenue_shares_status_chk CHECK (status IN ('dihitung','termasuk_payout'))
    );
    CREATE INDEX revenue_shares_course_idx ON revenue_shares (course_id);
    CREATE INDEX revenue_shares_instructor_idx ON revenue_shares (instructor_id);
    CREATE INDEX revenue_shares_order_item_idx ON revenue_shares (order_item_id);
    CREATE INDEX revenue_shares_periode_idx ON revenue_shares (periode);
    CREATE INDEX revenue_shares_status_idx ON revenue_shares (status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON revenue_shares FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── instructor_payouts ──
  pgm.sql(`
    CREATE TABLE instructor_payouts (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      instructor_id                 uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      periode                       varchar(7) NOT NULL,
      total_nominal                 numeric(18,2) NOT NULL,
      status                        payout_status NOT NULL DEFAULT 'dihitung',
      diajukan_oleh                 uuid REFERENCES users(id) ON DELETE SET NULL,
      disetujui_oleh                uuid REFERENCES users(id) ON DELETE SET NULL,
      disetujui_at                  timestamptz,
      dicairkan_at                  timestamptz,
      metode_pencairan              varchar(30),
      bukti_pencairan_media_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      catatan                       text,
      created_at                    timestamptz NOT NULL DEFAULT now(),
      updated_at                    timestamptz NOT NULL DEFAULT now(),
      deleted_at                    timestamptz,
      CONSTRAINT instructor_payouts_total_chk CHECK (total_nominal >= 0)
    );
    CREATE INDEX instructor_payouts_instructor_idx ON instructor_payouts (instructor_id);
    CREATE INDEX instructor_payouts_periode_idx ON instructor_payouts (periode);
    CREATE INDEX instructor_payouts_status_idx ON instructor_payouts (status);
    CREATE INDEX instructor_payouts_diajukan_oleh_idx ON instructor_payouts (diajukan_oleh);
    CREATE INDEX instructor_payouts_disetujui_oleh_idx ON instructor_payouts (disetujui_oleh);
    CREATE INDEX instructor_payouts_bukti_media_idx ON instructor_payouts (bukti_pencairan_media_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON instructor_payouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // FK melingkar: tambahkan instructor_payout_id setelah instructor_payouts terbentuk
  pgm.sql(`
    ALTER TABLE revenue_shares
      ADD COLUMN instructor_payout_id uuid REFERENCES instructor_payouts(id) ON DELETE SET NULL;
    CREATE INDEX revenue_shares_instructor_payout_idx ON revenue_shares (instructor_payout_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE revenue_shares DROP COLUMN IF EXISTS instructor_payout_id;`);
  pgm.sql(`DROP TABLE IF EXISTS instructor_payouts;`);
  pgm.sql(`DROP TABLE IF EXISTS revenue_shares;`);
  pgm.sql(`DROP TABLE IF EXISTS refunds;`);
  pgm.sql(`DROP TABLE IF EXISTS memberships;`);
  pgm.sql(`DROP TABLE IF EXISTS subscriptions;`);
  pgm.sql(`DROP TABLE IF EXISTS invoices;`);
  pgm.sql(`DROP TABLE IF EXISTS payments;`);
  pgm.sql(`DROP TABLE IF EXISTS order_items;`);
  pgm.sql(`DROP TABLE IF EXISTS orders;`);
  pgm.sql(`DROP TABLE IF EXISTS coupons;`);
  pgm.sql(`DROP TYPE IF EXISTS payout_status;`);
  pgm.sql(`DROP TYPE IF EXISTS refund_status;`);
  pgm.sql(`DROP TYPE IF EXISTS subscription_status;`);
  pgm.sql(`DROP TYPE IF EXISTS payment_status;`);
  pgm.sql(`DROP TYPE IF EXISTS payment_jenis;`);
  pgm.sql(`DROP TYPE IF EXISTS order_item_tipe;`);
  pgm.sql(`DROP TYPE IF EXISTS order_status;`);
  pgm.sql(`DROP TYPE IF EXISTS order_jalur;`);
}
