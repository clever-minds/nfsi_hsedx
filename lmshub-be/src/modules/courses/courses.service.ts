import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './courses.repository';
import {
  ArchiveCourseInput,
  CompletionRulesInput,
  CreateCourseInput,
  PublishCourseInput,
  UpdateCourseInput,
} from './courses.validation';

/** Peran yang boleh melakukan approval/publikasi course (Admin Ops/Direktur ke atas). */
const ADMIN_ROLES = ['super_admin', 'direktur', 'ketua', 'pembina', 'admin_ops'];
const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isAdmin = (actor: AuthContext) => actor.roles.some((r) => ADMIN_ROLES.includes(r));

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 200);
}

// Kepemilikan dibandingkan terhadap instructor_profiles.id (courses.instructor_id), bukan user id.
async function assertOwnerOrAdmin(actor: AuthContext, course: repo.CourseRow): Promise<void> {
  if (isSuper(actor) || isAdmin(actor)) return;
  const profileId = await repo.instructorProfileIdOf(actor.userId);
  if (!profileId || course.instructor_id !== profileId) {
    throw AppError.forbidden('You can only manage your own courses', 'course.not_owner');
  }
}

export async function list(actor: AuthContext, p: PageParams, filters: repo.Filters) {
  const scopeInstructorId =
    isSuper(actor) || isAdmin(actor) ? null : await repo.instructorProfileIdOf(actor.userId);
  return repo.list(p, { ...filters, scopeInstructorId });
}

export async function detail(actor: AuthContext, id: string) {
  const c = await repo.detail(id);
  if (!c) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnerOrAdmin(actor, c);
  return c;
}

export async function create(actor: AuthContext, input: CreateCourseInput) {
  const categoryOk = await repo.categoryExists(input.category_id);
  if (!categoryOk) throw AppError.badRequest('Category not found', 'category.not_found');

  // `instructor_id` di payload = USER id instructor. Hanya admin/super boleh menugaskan ke user lain.
  const targetUserId = input.instructor_id && (isSuper(actor) || isAdmin(actor)) ? input.instructor_id : actor.userId;
  // courses.instructor_id mereferensikan instructor_profiles.id → resolve/buat profil otomatis.
  const instructorId = await repo.ensureInstructorProfile(targetUserId);

  const slug = slugify(input.slug ?? input.title);
  const existingSlug = await repo.bySlug(slug);
  if (existingSlug) throw AppError.conflict('That course slug is already in use', 'course.slug_taken');

  if (input.thumbnail_media_id) {
    const ok = await repo.mediaAssetExists(input.thumbnail_media_id);
    if (!ok) throw AppError.badRequest('Thumbnail image not found', 'course.thumbnail_not_found');
  }
  if (input.promo_video_media_id) {
    const ok = await repo.mediaAssetExists(input.promo_video_media_id);
    if (!ok) throw AppError.badRequest('Promotional video not found', 'course.promo_video_not_found');
  }

  const { id } = await repo.insert({
    title: input.title,
    slug,
    summary: input.summary ?? null,
    description: input.description ?? null,
    category_id: input.category_id,
    instructor_id: instructorId,
    level: input.level,
    price: input.price,
    strike_price: input.strike_price ?? null,
    thumbnail_media_id: input.thumbnail_media_id ?? null,
    promo_video_media_id: input.promo_video_media_id ?? null,
    language: input.language,
    meta: input.meta ?? null,
  });

  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'create',
    entity: 'courses',
    entityId: id,
    after: { title: input.title, slug, instructor_id: instructorId },
  });
  return repo.detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateCourseInput) {
  const before = await detail(actor, id); // enforces scope

  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const existing = await repo.bySlug(slug);
    if (existing && existing.id !== id) throw AppError.conflict('That course slug is already in use', 'course.slug_taken');
    fields.slug = slug;
  }
  if (input.summary !== undefined) fields.summary = input.summary;
  if (input.description !== undefined) fields.description = input.description;
  if (input.category_id !== undefined) {
    const ok = await repo.categoryExists(input.category_id);
    if (!ok) throw AppError.badRequest('Category not found', 'category.not_found');
    fields.category_id = input.category_id;
  }
  if (input.level !== undefined) fields.level = input.level;
  if (input.price !== undefined) fields.price = input.price;
  if (input.strike_price !== undefined) fields.strike_price = input.strike_price;
  if (input.thumbnail_media_id !== undefined) fields.thumbnail_media_id = input.thumbnail_media_id;
  if (input.promo_video_media_id !== undefined) fields.promo_video_media_id = input.promo_video_media_id;
  if (input.language !== undefined) fields.language = input.language;
  if (input.meta !== undefined) fields.meta = input.meta;

  // Revisi pada course yang sudah Terbit otomatis pindah ke status "Diperbarui" (lihat aturan bisnis 02-catalog-course.md).
  if (before.publication_status === 'terbit' && Object.keys(fields).length > 0) {
    fields.publication_status = 'diperbarui';
  }

  await repo.update(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'update',
    entity: 'courses',
    entityId: id,
    before: { title: before.title, publication_status: before.publication_status },
    after: input,
  });
  return repo.detail(id);
}

/**
 * Atur ujian akhir & izin mengulang course.
 *
 * Endpoint tersendiri, bukan bagian dari `update`, karena aturan kelulusan
 * bukan isi catalog: mengubahnya tidak boleh memindahkan course Terbit ke
 * "Diperbarui" dan menunggu review ulang.
 */
export async function updateCompletionRules(actor: AuthContext, id: string, input: CompletionRulesInput) {
  const before = await detail(actor, id); // enforces scope
  const fields: { final_exam_quiz_id?: string | null; allow_restart?: boolean } = {};
  if (input.final_exam_quiz_id !== undefined) {
    if (input.final_exam_quiz_id && !(await repo.quizBelongsToCourse(input.final_exam_quiz_id, id))) {
      throw AppError.badRequest('The final exam must be a quiz of this course', 'course.final_exam_invalid');
    }
    fields.final_exam_quiz_id = input.final_exam_quiz_id;
  }
  if (input.allow_restart !== undefined) fields.allow_restart = input.allow_restart;
  await repo.updateCompletionRules(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'update_completion_rules',
    entity: 'courses',
    entityId: id,
    before: { final_exam_quiz_id: before.final_exam_quiz_id ?? null, allow_restart: before.allow_restart ?? false },
    after: fields,
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  const c = await detail(actor, id);
  if (c.publication_status !== 'draf') {
    throw AppError.conflict('A course that has been submitted or published cannot be deleted. Archive it instead', 'course.cannot_delete_published');
  }
  await repo.softDelete(id);
  await recordAudit({ userId: actor.userId, module: 'course', action: 'delete', entity: 'courses', entityId: id });
}

/** Draf → Dalam Review. Diajukan oleh instructor pemilik (atau admin/super). */
export async function submit(actor: AuthContext, id: string) {
  const c = await detail(actor, id); // enforces scope
  if (c.publication_status !== 'draf') {
    throw AppError.conflict('Only a draft course can be submitted for review', 'course.only_draft_can_be_submitted');
  }
  await repo.setStatus(id, 'dalam_review');
  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'submit',
    entity: 'courses',
    entityId: id,
    before: { publication_status: c.publication_status },
    after: { publication_status: 'dalam_review' },
  });
  return repo.detail(id);
}

/** Dalam Review/Diperbarui → Terbit. Hanya Admin Ops/Direktur ke atas ( pemisahan assignment pengajuan vs approval). */
export async function publish(actor: AuthContext, id: string, input: PublishCourseInput) {
  if (!isAdmin(actor)) throw AppError.forbidden('Only an Operations Admin or Director can publish a course', 'course.publish_requires_admin');
  const c = await repo.detail(id);
  if (!c) throw AppError.notFound('Course not found', 'course.not_found');
  if (!['dalam_review', 'diperbarui'].includes(c.publication_status)) {
    throw AppError.conflict('A course must be in review or updated before it can be published', 'course.publish_wrong_status');
  }
  const firstPublish = c.published_at === null;
  await repo.setStatus(id, 'terbit', firstPublish ? new Date() : undefined);
  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'publish',
    entity: 'courses',
    entityId: id,
    before: { publication_status: c.publication_status },
    after: { publication_status: 'terbit' },
    reason: input.catatan ?? null,
  });
  return repo.detail(id);
}

/** → Diarsip. Course tidak muncul di catalog publik, student yang sudah enroll tetap punya akses. */
export async function archive(actor: AuthContext, id: string, input: ArchiveCourseInput) {
  const c = await detail(actor, id); // enforces scope
  if (c.publication_status === 'diarsip') throw AppError.conflict('This course is already archived', 'course.already_archived');
  await repo.setStatus(id, 'diarsip');
  await recordAudit({
    userId: actor.userId,
    module: 'course',
    action: 'archive',
    entity: 'courses',
    entityId: id,
    before: { publication_status: c.publication_status },
    after: { publication_status: 'diarsip' },
    reason: input.alasan ?? null,
  });
  return repo.detail(id);
}

// ── Publik ───────────────────────────────────────────
export async function publicList(p: PageParams, filters: repo.PublicFilters) {
  return repo.publicList(p, filters);
}

export async function publicDetail(slug: string) {
  const c = await repo.publicBySlug(slug);
  if (!c) throw AppError.notFound('Course not found', 'course.not_found');
  const kurikulum = await repo.publicCurriculum(c.id);
  return { ...c, kurikulum };
}
