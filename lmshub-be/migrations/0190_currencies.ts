import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Multi-currency display.
 *
 * Amounts are stored once, in the store's base currency, and converted only for
 * display. Storing per-currency prices would mean every rate change silently
 * repricing the catalogue, and an order whose total no longer matches what was
 * charged; a single stored amount plus a rate keeps the money unambiguous.
 *
 * `rate` reads as: one unit of the base currency equals `rate` units of this
 * one. The base currency is named by the existing `currency.code` setting and
 * always has a rate of exactly 1, which the service enforces rather than trusts.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE currencies (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode         varchar(3) NOT NULL,
      nama         varchar(80) NOT NULL,
      /* Blank falls back to the code, which is what Intl does for currencies
         with no well-known glyph. */
      simbol       varchar(8) NOT NULL DEFAULT '',
      /* 1 base = rate * this. numeric, never float: a rate like 15873.02 loses
         cents to binary rounding and the loss compounds across a cart. */
      rate         numeric(20,8) NOT NULL DEFAULT 1,
      /* Display decimals. IDR and JPY are written whole; KWD uses three. */
      desimal      smallint NOT NULL DEFAULT 2,
      is_aktif     boolean NOT NULL DEFAULT true,
      urutan       int NOT NULL DEFAULT 0,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      deleted_at   timestamptz,
      CONSTRAINT currencies_rate_chk CHECK (rate > 0),
      CONSTRAINT currencies_desimal_chk CHECK (desimal BETWEEN 0 AND 4)
    );
    CREATE UNIQUE INDEX currencies_kode_uq ON currencies (upper(kode)) WHERE deleted_at IS NULL;
    CREATE INDEX currencies_aktif_idx ON currencies (is_aktif, urutan);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON currencies
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // Seed the base currency from whatever the store is already using, at rate 1,
  // so an existing installation behaves exactly as before until someone adds a
  // second currency.
  pgm.sql(`
    INSERT INTO currencies (kode, nama, simbol, rate, desimal, is_aktif, urutan)
    SELECT upper(COALESCE(NULLIF(s.nilai, ''), 'USD')),
           CASE upper(COALESCE(NULLIF(s.nilai, ''), 'USD'))
             WHEN 'IDR' THEN 'Indonesian Rupiah'
             WHEN 'USD' THEN 'US Dollar'
             ELSE upper(COALESCE(NULLIF(s.nilai, ''), 'USD'))
           END,
           CASE upper(COALESCE(NULLIF(s.nilai, ''), 'USD'))
             WHEN 'IDR' THEN 'Rp' WHEN 'USD' THEN '$' ELSE '' END,
           1,
           CASE WHEN upper(COALESCE(NULLIF(s.nilai, ''), 'USD')) IN ('IDR','JPY','KRW','VND') THEN 0 ELSE 2 END,
           true, 0
      FROM settings s
     WHERE s.key = 'currency.code' AND s.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
  `);

  // Whether shoppers may switch at all. Off by default: a store with one
  // currency should not grow a dropdown containing one option.
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, is_public, is_encrypted, deskripsi) VALUES
      ('currency.switcher_enabled', 'currency', 'Let visitors switch currency', 'boolean', 'false', true, false,
       'Shows a currency picker beside the language picker. Prices are converted for display only; payment is still taken in the base currency.')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS currencies;`);
  pgm.sql(`DELETE FROM settings WHERE key = 'currency.switcher_enabled';`);
}
