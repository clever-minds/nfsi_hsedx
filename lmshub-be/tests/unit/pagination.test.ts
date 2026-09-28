import { describe, it, expect } from 'vitest';
import { Request } from 'express';
import { parsePage, pageMeta } from '../../src/core/http/pagination';

const req = (query: Record<string, unknown>) => ({ query }) as unknown as Request;

describe('pagination', () => {
  it('default page/limit', () => {
    const p = parsePage(req({}));
    expect(p).toMatchObject({ page: 1, limit: 20, offset: 0, order: 'ASC' });
  });
  it('menghitung offset', () => {
    const p = parsePage(req({ page: '3', limit: '10' }));
    expect(p).toMatchObject({ page: 3, limit: 10, offset: 20 });
  });
  it('membatasi limit maksimum', () => {
    expect(parsePage(req({ limit: '9999' })).limit).toBe(100);
  });
  it('sort dengan prefix - → DESC', () => {
    const p = parsePage(req({ sort: '-created_at' }));
    expect(p).toMatchObject({ sort: 'created_at', order: 'DESC' });
  });
  it('pageMeta menghitung totalPages', () => {
    expect(pageMeta(1, 20, 45)).toMatchObject({ page: 1, limit: 20, total: 45, totalPages: 3 });
    expect(pageMeta(1, 20, 0).totalPages).toBe(1);
  });
});
