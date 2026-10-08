import { describe, it, expect } from 'vitest';
import { can } from '../../src/core/rbac/rbacService';

describe('rbac.can', () => {
  it('super_admin wildcard mengizinkan semua', () => {
    const perms = new Set<string>(['*']);
    expect(can(perms, 'course.view')).toBe(true);
    expect(can(perms, 'apapun.delete')).toBe(true);
  });
  it('mengizinkan key yang dimiliki', () => {
    const perms = new Set<string>(['course.view', 'transaction.create']);
    expect(can(perms, 'course.view')).toBe(true);
    expect(can(perms, 'transaction.create')).toBe(true);
  });
  it('menolak key yang tidak dimiliki', () => {
    const perms = new Set<string>(['course.view']);
    expect(can(perms, 'course.delete')).toBe(false);
    expect(can(perms, 'pengguna.view')).toBe(false);
  });
});
