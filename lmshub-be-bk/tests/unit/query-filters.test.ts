import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

/**
 * Regression guard for a silent, app-wide filter failure.
 *
 * Every list controller reads its filters as literal bracket keys —
 * `req.query['filter[status]']` — matching what the frontend sends. Express's
 * default 'extended' parser instead rewrites that into `req.query.filter.status`,
 * which makes all 60+ filter reads `undefined`. Nothing throws; lists simply
 * ignore the filter and return everything, which is far harder to notice than
 * a crash. `app.set('query parser', 'simple')` in `app.ts` is what prevents it.
 */

/** Mirrors how `createApp()` configures parsing, without booting the whole app. */
function appWithSimpleParser() {
  const app = express();
  app.set('query parser', 'simple');
  app.get('/probe', (req, res) => res.json(req.query));
  return app;
}

describe('query filter parsing', () => {
  it('keeps bracket filters as literal keys', async () => {
    const res = await request(appWithSimpleParser()).get(
      '/probe?filter[dari]=2026-08-01&filter[sampai]=2026-08-31&filter[status]=lunas',
    );

    expect(res.body['filter[dari]']).toBe('2026-08-01');
    expect(res.body['filter[sampai]']).toBe('2026-08-31');
    expect(res.body['filter[status]']).toBe('lunas');
    // The nested form must NOT appear, or controllers would read undefined.
    expect(res.body.filter).toBeUndefined();
  });

  it('still reads plain pagination and search params', async () => {
    const res = await request(appWithSimpleParser()).get('/probe?page=2&limit=50&q=budi&sort=-created_at');

    expect(res.body.page).toBe('2');
    expect(res.body.limit).toBe('50');
    expect(res.body.q).toBe('budi');
    expect(res.body.sort).toBe('-created_at');
  });

  it("demonstrates what Express's default parser would have done", async () => {
    // Documents the bug this guard exists for: the same request under the
    // default parser yields a nested object and no literal key at all.
    const app = express(); // no query parser override — Express defaults to 'extended'
    app.get('/probe', (req, res) => res.json(req.query));

    const res = await request(app).get('/probe?filter[status]=lunas');

    expect(res.body['filter[status]']).toBeUndefined();
    expect(res.body.filter).toEqual({ status: 'lunas' });
  });
});
