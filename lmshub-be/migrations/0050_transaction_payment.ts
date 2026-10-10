/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 05 — Transaction & Payment — domain finansial
 * coupons, orders, order_items, payments, invoices, subscriptions, memberships, refunds,
 * revenue_shares, instructor_payouts.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_channel AS ENUM ('online','manual');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_status AS ENUM
      ('awaiting_payment','installment_running','paid_in_full','access_active','cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE order_item_type AS ENUM ('course','bundle','path','subscription');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payment_type AS ENUM ('full','down_payment','installment');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('awaiting_verification','verified','rejected');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('active','inactive','expired','cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE refund_status AS ENUM ('submitted','approved','rejected','processing','completed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE payout_status AS ENUM ('calculated','awaiting_approval','approved','disbursement','completed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── coupons (created lebih awal — direferensikan orders) ──
  pgm.sql(`
    CREATE TABLE coupons (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode                  citext NOT NULL,
      discount_type         varchar(10) NOT NULL,
      discount_value        numeric(18,2) NOT NULL,
      max_quota        integer,
      used_quota        integer NOT NULL DEFAULT 0,
      min_purchase     numeric(18,2),
      valid_from         timestamptz,
      valid_until        timestamptz,
      is_active              boolean NOT NULL DEFAULT true,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT coupons_type_discount_chk CHECK (discount_type IN ('persen','amount')),
      CONSTRAINT coupons_value_discount_chk CHECK (discount_value >= 0)
    );
    CREATE UNIQUE INDEX coupons_kode_uq ON coupons (kode) WHERE deleted_at IS NULL;
    CREATE INDEX coupons_valid_until_idx ON coupons (valid_until);
    CREATE INDEX coupons_is_aktif_idx ON coupons (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── orders ──
  pgm.sql(`
    CREATE TABLE orders (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_user_id               uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      channel                       order_channel NOT NULL,
      marketing_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
      status                      order_status NOT NULL DEFAULT 'awaiting_payment',
      coupon_id                   uuid REFERENCES coupons(id) ON DELETE SET NULL,
      subtotal                    numeric(18,2) NOT NULL DEFAULT 0,
      discount                      numeric(18,2) NOT NULL DEFAULT 0,
      total                       numeric(18,2) NOT NULL DEFAULT 0,
      checkout_expired_at     timestamptz,
      notes                     text,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT orders_subtotal_chk CHECK (subtotal >= 0),
      CONSTRAINT orders_discount_chk CHECK (discount >= 0),
      CONSTRAINT orders_total_chk CHECK (total >= 0)
    );
    CREATE INDEX orders_buyer_idx ON orders (buyer_user_id);
    CREATE INDEX orders_channel_idx ON orders (channel);
    CREATE INDEX orders_marketing_idx ON orders (marketing_user_id);
    CREATE INDEX orders_status_idx ON orders (status);
    CREATE INDEX orders_coupon_idx ON orders (coupon_id);
    CREATE INDEX orders_checkout_kedaluwarsa_idx ON orders (checkout_expired_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── order_items (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE order_items (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_type             order_item_type NOT NULL,
      course_id             uuid REFERENCES courses(id) ON DELETE RESTRICT,
      learning_path_id      uuid REFERENCES learning_paths(id) ON DELETE RESTRICT,
      bundle_group_id       uuid,
      price_unit          numeric(18,2) NOT NULL,
      quantity             integer NOT NULL DEFAULT 1,
      subtotal              numeric(18,2) NOT NULL,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT order_items_price_unit_chk CHECK (price_unit >= 0),
      CONSTRAINT order_items_quantity_chk CHECK (quantity > 0),
      CONSTRAINT order_items_subtotal_chk CHECK (subtotal >= 0),
      CONSTRAINT order_items_type_kombinasi_chk CHECK (
        (item_type IN ('course','bundle') AND course_id IS NOT NULL) OR
        (item_type = 'path' AND learning_path_id IS NOT NULL) OR
        (item_type = 'subscription' AND course_id IS NULL AND learning_path_id IS NULL)
      )
    );
    CREATE INDEX order_items_order_idx ON order_items (order_id);
    CREATE INDEX order_items_item_type_idx ON order_items (item_type);
    CREATE INDEX order_items_course_idx ON order_items (course_id);
    CREATE INDEX order_items_learning_path_idx ON order_items (learning_path_id);
    CREATE INDEX order_items_bundle_group_idx ON order_items (bundle_group_id);
  `);

  // ── payments ──
  pgm.sql(`
    CREATE TABLE payments (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                  uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      type                     payment_type NOT NULL,
      amount                   numeric(18,2) NOT NULL,
      method                    varchar(30) NOT NULL,
      status                    payment_status NOT NULL DEFAULT 'awaiting_verification',
      proof_media_id            uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      gateway_reference         varchar(150),
      verified_by               uuid REFERENCES users(id) ON DELETE SET NULL,
      verified_at               timestamptz,
      notes_verifikasi        text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT payments_amount_chk CHECK (amount > 0)
    );
    CREATE UNIQUE INDEX payments_gateway_reference_uq ON payments (gateway_reference) WHERE gateway_reference IS NOT NULL;
    CREATE INDEX payments_order_idx ON payments (order_id);
    CREATE INDEX payments_type_idx ON payments (type);
    CREATE INDEX payments_method_idx ON payments (method);
    CREATE INDEX payments_status_idx ON payments (status);
    CREATE INDEX payments_proof_media_idx ON payments (proof_media_id);
    CREATE INDEX payments_verified_by_idx ON payments (verified_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── invoices ──
  pgm.sql(`
    CREATE TABLE invoices (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      number_invoice       varchar(50) NOT NULL,
      pdf_media_id        uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      issued_at      timestamptz NOT NULL DEFAULT now(),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz
    );
    CREATE UNIQUE INDEX invoices_number_uq ON invoices (number_invoice);
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
      package                     varchar(100) NOT NULL,
      period                   varchar(20) NOT NULL,
      status                    subscription_status NOT NULL DEFAULT 'active',
      started_at                  timestamptz NOT NULL,
      ended_at               timestamptz NOT NULL,
      auto_renewal     boolean NOT NULL DEFAULT false,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT subscriptions_period_chk CHECK (period IN ('monthly','yearly'))
    );
    CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);
    CREATE INDEX subscriptions_order_idx ON subscriptions (order_id);
    CREATE INDEX subscriptions_status_idx ON subscriptions (status);
    CREATE INDEX subscriptions_berakhir_idx ON subscriptions (ended_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE memberships (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id   uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
      access_scope       varchar(20) NOT NULL DEFAULT 'all_courses',
      scope_ref_id      uuid,
      started_at          timestamptz NOT NULL,
      ended_at       timestamptz,
      is_active          boolean NOT NULL DEFAULT true,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      CONSTRAINT memberships_scope_chk CHECK (access_scope IN ('all_courses','category','path'))
    );
    CREATE INDEX memberships_user_idx ON memberships (user_id);
    CREATE INDEX memberships_subscription_idx ON memberships (subscription_id);
    CREATE INDEX memberships_scope_idx ON memberships (access_scope);
    CREATE INDEX memberships_scope_ref_idx ON memberships (scope_ref_id);
    CREATE INDEX memberships_is_aktif_idx ON memberships (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── refunds ──
  pgm.sql(`
    CREATE TABLE refunds (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                  uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      amount                   numeric(18,2) NOT NULL,
      reason                    text NOT NULL,
      status                    refund_status NOT NULL DEFAULT 'submitted',
      submitted_by             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_by            uuid REFERENCES users(id) ON DELETE SET NULL,
      approved_at              timestamptz,
      processed_at               timestamptz,
      method_pengembalian       varchar(30),
      notes                   text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      deleted_at                timestamptz,
      CONSTRAINT refunds_amount_chk CHECK (amount > 0)
    );
    CREATE INDEX refunds_order_idx ON refunds (order_id);
    CREATE INDEX refunds_status_idx ON refunds (status);
    CREATE INDEX refunds_submitted_by_idx ON refunds (submitted_by);
    CREATE INDEX refunds_approved_by_idx ON refunds (approved_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── revenue_shares (tanpa instructor_payout_id — ditambah setelah instructor_payouts ada) ──
  pgm.sql(`
    CREATE TABLE revenue_shares (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id             uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      instructor_id         uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      order_item_id         uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
      share_percentage          numeric(5,2) NOT NULL,
      amount_share         numeric(18,2) NOT NULL,
      amount_platform      numeric(18,2) NOT NULL,
      period               varchar(7) NOT NULL,
      status                varchar(20) NOT NULL DEFAULT 'calculated',
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT revenue_shares_persen_chk CHECK (share_percentage BETWEEN 0 AND 100),
      CONSTRAINT revenue_shares_amount_share_chk CHECK (amount_share >= 0),
      CONSTRAINT revenue_shares_amount_platform_chk CHECK (amount_platform >= 0),
      CONSTRAINT revenue_shares_status_chk CHECK (status IN ('calculated','included_in_payout'))
    );
    CREATE INDEX revenue_shares_course_idx ON revenue_shares (course_id);
    CREATE INDEX revenue_shares_instructor_idx ON revenue_shares (instructor_id);
    CREATE INDEX revenue_shares_order_item_idx ON revenue_shares (order_item_id);
    CREATE INDEX revenue_shares_period_idx ON revenue_shares (period);
    CREATE INDEX revenue_shares_status_idx ON revenue_shares (status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON revenue_shares FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── instructor_payouts ──
  pgm.sql(`
    CREATE TABLE instructor_payouts (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      instructor_id                 uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      period                       varchar(7) NOT NULL,
      total_amount                 numeric(18,2) NOT NULL,
      status                        payout_status NOT NULL DEFAULT 'calculated',
      submitted_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
      approved_by                uuid REFERENCES users(id) ON DELETE SET NULL,
      approved_at                  timestamptz,
      disbursed_at                  timestamptz,
      method_pencairan              varchar(30),
      disbursement_proof_media_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      notes                       text,
      created_at                    timestamptz NOT NULL DEFAULT now(),
      updated_at                    timestamptz NOT NULL DEFAULT now(),
      deleted_at                    timestamptz,
      CONSTRAINT instructor_payouts_total_chk CHECK (total_amount >= 0)
    );
    CREATE INDEX instructor_payouts_instructor_idx ON instructor_payouts (instructor_id);
    CREATE INDEX instructor_payouts_period_idx ON instructor_payouts (period);
    CREATE INDEX instructor_payouts_status_idx ON instructor_payouts (status);
    CREATE INDEX instructor_payouts_submitted_by_idx ON instructor_payouts (submitted_by);
    CREATE INDEX instructor_payouts_approved_by_idx ON instructor_payouts (approved_by);
    CREATE INDEX instructor_payouts_proof_media_idx ON instructor_payouts (disbursement_proof_media_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON instructor_payouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // FK melingkar: add instructor_payout_id setelah instructor_payouts terbentuk
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
  pgm.sql(`DROP TYPE IF EXISTS payment_type;`);
  pgm.sql(`DROP TYPE IF EXISTS order_item_type;`);
  pgm.sql(`DROP TYPE IF EXISTS order_status;`);
  pgm.sql(`DROP TYPE IF EXISTS order_channel;`);
}
