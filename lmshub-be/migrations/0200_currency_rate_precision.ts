import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Widen the exchange-rate column.
 *
 * `numeric(20,8)` looks generous until the base currency is one with a large
 * unit count. With IDR as the base — realistic for this product — one dollar is
 * 0.00006154, and eight decimal places leave only four significant figures. A
 * $100 course then renders about 0.03% off, and switching the base back and
 * forth compounds the error each time.
 *
 * Twelve decimals give small rates the same precision large ones already had.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE currencies ALTER COLUMN rate TYPE numeric(24,12);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE currencies ALTER COLUMN rate TYPE numeric(20,8);`);
}
