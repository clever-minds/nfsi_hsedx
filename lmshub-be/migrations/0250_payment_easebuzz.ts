import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, is_public, is_encrypted, description) VALUES
      ('payment.easebuzz.enabled', 'payment', 'Easebuzz', 'boolean', 'false', false, false, 'Easebuzz payment gateway for India.'),
      ('payment.easebuzz.key', 'payment_easebuzz', 'Merchant Key', 'string', '', false, true, 'Your Easebuzz Merchant Key.'),
      ('payment.easebuzz.salt', 'payment_easebuzz', 'Salt', 'string', '', false, true, 'Your Easebuzz Salt.'),
      ('payment.easebuzz.env', 'payment_easebuzz', 'Environment', 'string', 'test', false, false, 'Set to prod for production.')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM settings WHERE key IN (
      'payment.easebuzz.enabled',
      'payment.easebuzz.key',
      'payment.easebuzz.salt',
      'payment.easebuzz.env'
    );
  `);
}
