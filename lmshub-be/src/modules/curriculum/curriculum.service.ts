import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './curriculum.repository';
import {
  CreateContentInput,
  CreateLessonInput,
  CreateSectionInput,
  ReorderLessonsInput,
  ReorderSectionsInput,
  UpdateContentInput,
  UpdateLessonInput,
  UpdateSectionInput,
} from './curriculum.validation';

const ADMIN_ROLES = ['super_admin', 'direktur', 'ketua', 'pembina', 'admin_ops'];
const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isAdmin = (actor: AuthContext) => actor.roles.some((r) => ADMIN_ROLES.includes(r));

/** Row-level "Sendiri": instruktur hanya boleh mengelola kurikulum kursus miliknya. */
async function assertOwnsCourse(actor: AuthContext, courseId: string): Promise<void> {
  if (isSuper(actor) || isAdmin(actor)) return;
  const instructorId = await repo.courseInstructorId(courseId);
  if (!instructorId) throw AppError.notFound('Course not found', 'course.not_found');
  if (instructorId !== actor.userId) {
    throw AppError.forbidden('You can only manage the curriculum of your own courses', 'curriculum.not_owner');
  }
}

// ── Sections ─────────────────────────────────────────
export async function listSections(actor: AuthContext, courseId: string) {
  const exists = await repo.courseExists(courseId);
  if (!exists) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);
  const sections = await repo.listSections(courseId);
  return Promise.all(sections.map(async (s) => ({ ...s, lessons: await repo.listLessonsBySection(s.id) })));
}

export async function createSection(actor: AuthContext, courseId: string, input: CreateSectionInput) {
  const exists = await repo.courseExists(courseId);
  if (!exists) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);

  const urutan = input.urutan ?? (await repo.nextSectionUrutan(courseId));
  const { id } = await repo.insertSection({
    course_id: courseId,
    judul: input.judul,
    urutan,
    deskripsi: input.deskripsi ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'create_section',
    entity: 'sections',
    entityId: id,
    after: input,
  });
  return repo.sectionDetail(id);
}

export async function updateSection(actor: AuthContext, id: string, input: UpdateSectionInput) {
  const section = await repo.sectionDetail(id);
  if (!section) throw AppError.notFound('Section not found', 'section.not_found');
  await assertOwnsCourse(actor, section.course_id);

  const fields: Record<string, unknown> = {};
  if (input.judul !== undefined) fields.judul = input.judul;
  if (input.urutan !== undefined) fields.urutan = input.urutan;
  if (input.deskripsi !== undefined) fields.deskripsi = input.deskripsi;

  await repo.updateSection(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'update_section',
    entity: 'sections',
    entityId: id,
    before: section,
    after: input,
  });
  return repo.sectionDetail(id);
}

export async function removeSection(actor: AuthContext, id: string) {
  const section = await repo.sectionDetail(id);
  if (!section) throw AppError.notFound('Section not found', 'section.not_found');
  await assertOwnsCourse(actor, section.course_id);
  await repo.softDeleteSection(id);
  await recordAudit({ userId: actor.userId, module: 'kurikulum', action: 'delete_section', entity: 'sections', entityId: id });
}

export async function reorderSections(actor: AuthContext, courseId: string, input: ReorderSectionsInput) {
  const exists = await repo.courseExists(courseId);
  if (!exists) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);

  await repo.reorderSections(input.items);
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'reorder_sections',
    entity: 'sections',
    entityId: courseId,
    after: input.items,
  });
  return repo.listSections(courseId);
}

// ── Lessons ──────────────────────────────────────────
export async function listLessons(actor: AuthContext, sectionId: string) {
  const section = await repo.sectionDetail(sectionId);
  if (!section) throw AppError.notFound('Section not found', 'section.not_found');
  await assertOwnsCourse(actor, section.course_id);
  return repo.listLessonsBySection(sectionId);
}

export async function createLesson(actor: AuthContext, sectionId: string, input: CreateLessonInput) {
  const section = await repo.sectionDetail(sectionId);
  if (!section) throw AppError.notFound('Section not found', 'section.not_found');
  await assertOwnsCourse(actor, section.course_id);

  const urutan = input.urutan ?? (await repo.nextLessonUrutan(sectionId));
  const { id } = await repo.insertLesson({
    section_id: sectionId,
    judul: input.judul,
    tipe: input.tipe,
    urutan,
    durasi_menit: input.durasi_menit ?? null,
    gratis_preview: input.gratis_preview ?? false,
    drip_release_at: input.drip_release_at ?? null,
    wajib_selesai: input.wajib_selesai ?? true,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'create_lesson',
    entity: 'lessons',
    entityId: id,
    after: input,
  });
  return repo.lessonDetail(id);
}

export async function updateLesson(actor: AuthContext, id: string, input: UpdateLessonInput) {
  const lesson = await repo.lessonDetail(id);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const courseId = await repo.courseIdOfLesson(id);
  if (!courseId) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);

  if (input.section_id !== undefined && input.section_id !== lesson.section_id) {
    const targetSection = await repo.sectionDetail(input.section_id);
    if (!targetSection || targetSection.course_id !== courseId) {
      throw AppError.badRequest('That section does not belong to this course', 'section.invalid_target');
    }
  }

  const fields: Record<string, unknown> = {};
  if (input.judul !== undefined) fields.judul = input.judul;
  if (input.tipe !== undefined) fields.tipe = input.tipe;
  if (input.urutan !== undefined) fields.urutan = input.urutan;
  if (input.durasi_menit !== undefined) fields.durasi_menit = input.durasi_menit;
  if (input.gratis_preview !== undefined) fields.gratis_preview = input.gratis_preview;
  if (input.drip_release_at !== undefined) fields.drip_release_at = input.drip_release_at;
  if (input.wajib_selesai !== undefined) fields.wajib_selesai = input.wajib_selesai;
  if (input.section_id !== undefined) fields.section_id = input.section_id;

  await repo.updateLesson(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'update_lesson',
    entity: 'lessons',
    entityId: id,
    before: lesson,
    after: input,
  });
  return repo.lessonDetail(id);
}

export async function removeLesson(actor: AuthContext, id: string) {
  const lesson = await repo.lessonDetail(id);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const courseId = await repo.courseIdOfLesson(id);
  if (!courseId) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);
  await repo.softDeleteLesson(id);
  await recordAudit({ userId: actor.userId, module: 'kurikulum', action: 'delete_lesson', entity: 'lessons', entityId: id });
}

export async function reorderLessons(actor: AuthContext, input: ReorderLessonsInput) {
  const first = await repo.lessonDetail(input.items[0].id);
  if (!first) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const courseId = await repo.courseIdOfLesson(input.items[0].id);
  if (!courseId) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);

  await repo.reorderLessons(input.items);
  await recordAudit({
    userId: actor.userId,
    module: 'kurikulum',
    action: 'reorder_lessons',
    entity: 'lessons',
    after: input.items,
  });
  return input.items;
}

// ── Lesson Contents ──────────────────────────────────
export async function listContents(actor: AuthContext, lessonId: string) {
  const courseId = await repo.courseIdOfLesson(lessonId);
  if (!courseId) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  await assertOwnsCourse(actor, courseId);
  return repo.listContents(lessonId);
}

export async function createContent(actor: AuthContext, lessonId: string, input: CreateContentInput) {
  const courseId = await repo.courseIdOfLesson(lessonId);
  if (!courseId) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  await assertOwnsCourse(actor, courseId);

  const urutan = input.urutan ?? (await repo.nextContentUrutan(lessonId));
  const { id } = await repo.insertContent({
    lesson_id: lessonId,
    tipe: input.tipe,
    urutan,
    body: input.body ?? null,
    media_asset_id: input.media_asset_id ?? null,
    url: input.url ?? null,
    scorm_manifest_url: input.scorm_manifest_url ?? null,
    durasi_detik: input.durasi_detik ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'create_content',
    entity: 'lesson_contents',
    entityId: id,
    after: input,
  });
  return repo.contentDetail(id);
}

export async function updateContent(actor: AuthContext, id: string, input: UpdateContentInput) {
  const content = await repo.contentDetail(id);
  if (!content) throw AppError.notFound('Content not found', 'content.not_found');
  const courseId = await repo.courseIdOfContent(id);
  if (!courseId) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);

  const fields: Record<string, unknown> = {};
  if (input.tipe !== undefined) fields.tipe = input.tipe;
  if (input.urutan !== undefined) fields.urutan = input.urutan;
  if (input.body !== undefined) fields.body = input.body;
  if (input.media_asset_id !== undefined) fields.media_asset_id = input.media_asset_id;
  if (input.url !== undefined) fields.url = input.url;
  if (input.scorm_manifest_url !== undefined) fields.scorm_manifest_url = input.scorm_manifest_url;
  if (input.durasi_detik !== undefined) fields.durasi_detik = input.durasi_detik;

  await repo.updateContent(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'konten',
    action: 'update_content',
    entity: 'lesson_contents',
    entityId: id,
    before: content,
    after: input,
  });
  return repo.contentDetail(id);
}

export async function removeContent(actor: AuthContext, id: string) {
  const content = await repo.contentDetail(id);
  if (!content) throw AppError.notFound('Content not found', 'content.not_found');
  const courseId = await repo.courseIdOfContent(id);
  if (!courseId) throw AppError.notFound('Course not found', 'course.not_found');
  await assertOwnsCourse(actor, courseId);
  await repo.softDeleteContent(id);
  await recordAudit({ userId: actor.userId, module: 'konten', action: 'delete_content', entity: 'lesson_contents', entityId: id });
}
