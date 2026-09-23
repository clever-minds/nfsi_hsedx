import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './categories.repository';
import { CreateCategoryInput, CreateTagInput, UpdateCategoryInput, UpdateTagInput } from './categories.validation';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 150);
}

// ── Categories ───────────────────────────────────────
export async function list(p: PageParams, filters: repo.CategoryFilters) {
  return repo.list(p, filters);
}

export async function publicList() {
  return repo.publicList();
}

export async function publicDetail(slug: string) {
  const c = await repo.bySlug(slug);
  if (!c || !c.is_aktif) throw AppError.notFound('Category not found', 'category.not_found');
  return c;
}

export async function detail(id: string) {
  const c = await repo.detail(id);
  if (!c) throw AppError.notFound('Category not found', 'category.not_found');
  return c;
}

export async function create(actor: AuthContext, input: CreateCategoryInput) {
  const slug = slugify(input.slug ?? input.nama);
  const existing = await repo.bySlug(slug);
  if (existing) throw AppError.conflict('That category slug is already in use', 'category.slug_taken');

  const { id } = await repo.insert({
    nama: input.nama,
    slug,
    deskripsi: input.deskripsi ?? null,
    ikon: input.ikon ?? null,
    urutan: input.urutan ?? 0,
    is_aktif: input.is_aktif ?? true,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'kategori',
    action: 'create',
    entity: 'categories',
    entityId: id,
    after: input,
  });
  return repo.detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateCategoryInput) {
  const before = await detail(id);
  const fields: Record<string, unknown> = {};
  if (input.nama !== undefined) fields.nama = input.nama;
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const existing = await repo.bySlug(slug);
    if (existing && existing.id !== id) throw AppError.conflict('That category slug is already in use', 'category.slug_taken');
    fields.slug = slug;
  }
  if (input.deskripsi !== undefined) fields.deskripsi = input.deskripsi;
  if (input.ikon !== undefined) fields.ikon = input.ikon;
  if (input.urutan !== undefined) fields.urutan = input.urutan;
  if (input.is_aktif !== undefined) fields.is_aktif = input.is_aktif;

  await repo.update(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'kategori',
    action: 'update',
    entity: 'categories',
    entityId: id,
    before: { nama: before.nama, slug: before.slug, is_aktif: before.is_aktif },
    after: input,
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  await detail(id);
  const used = await repo.countCoursesUsing(id);
  if (used > 0) {
    throw AppError.conflict('This category is still used by active courses. Deactivate it instead of deleting it', 'category.in_use');
  }
  await repo.softDelete(id);
  await recordAudit({ userId: actor.userId, module: 'kategori', action: 'delete', entity: 'categories', entityId: id });
}

// ── Tags ─────────────────────────────────────────────
export async function tagList(p: PageParams, filters: repo.TagFilters) {
  return repo.listTags(p, filters);
}

export async function publicTagList() {
  return repo.publicListTags();
}

export async function tagDetail(id: string) {
  const t = await repo.detailTag(id);
  if (!t) throw AppError.notFound('Tag not found', 'tag.not_found');
  return t;
}

export async function tagCreate(actor: AuthContext, input: CreateTagInput) {
  const slug = slugify(input.slug ?? input.nama);
  const existing = await repo.tagBySlug(slug);
  if (existing) throw AppError.conflict('That tag slug is already in use', 'tag.slug_taken');

  const { id } = await repo.insertTag({ nama: input.nama, slug });
  await recordAudit({ userId: actor.userId, module: 'kategori', action: 'create_tag', entity: 'tags', entityId: id, after: input });
  return repo.detailTag(id);
}

export async function tagUpdate(actor: AuthContext, id: string, input: UpdateTagInput) {
  const before = await tagDetail(id);
  const fields: Record<string, unknown> = {};
  if (input.nama !== undefined) fields.nama = input.nama;
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const existing = await repo.tagBySlug(slug);
    if (existing && existing.id !== id) throw AppError.conflict('That tag slug is already in use', 'tag.slug_taken');
    fields.slug = slug;
  }

  await repo.updateTag(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'kategori',
    action: 'update_tag',
    entity: 'tags',
    entityId: id,
    before,
    after: input,
  });
  return repo.detailTag(id);
}

export async function tagRemove(actor: AuthContext, id: string) {
  await tagDetail(id);
  const used = await repo.countCoursesUsingTag(id);
  if (used > 0) {
    throw AppError.conflict('This tag is still used by courses. Remove it from them first', 'tag.in_use');
  }
  await repo.softDeleteTag(id);
  await recordAudit({ userId: actor.userId, module: 'kategori', action: 'delete_tag', entity: 'tags', entityId: id });
}
