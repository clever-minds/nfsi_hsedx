import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { AppError } from '../../core/http/AppError';
import { hashPassword, verifyPassword } from '../../core/auth/password';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { loadEffectivePermissions } from '../../core/rbac/rbacService';
import { PageParams } from '../../core/http/pagination';
import * as repo from './users.repository';
import {
  ChangeMyPasswordInput,
  ChangeMyEmailInput,
  CreateUserInput,
  SetPermissionsInput,
  UpdateMeInput,
  UpdateUserInput,
  UploadMyPhotoInput,
  VerifyInput,
} from './users.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');

/**
 * Aturan tangga peran, dipisahkan supaya bisa diuji tanpa basis data:
 * sebuah peran hanya boleh diberikan bila ia berada DI BAWAH peran pemberinya.
 * `roles.level` 0 = super_admin … 9 = sub_user, jadi "di bawah" berarti angkanya
 * lebih besar. Sama level pun ditolak — dua admin sederajat no saling
 * mengangkat.
 */
export function bolehMemberiPeran(actorLevel: number, roleLevel: number): boolean {
  return roleLevel > actorLevel;
}

/**
 * Level peran seorang aktor, read from basis data. `null` diperlakukan sebagai
 * "no berperan apa pun", yaitu paling rendah — bukan paling tinggi.
 */
async function levelOf(userId: string): Promise<number> {
  const level = await repo.highestRoleLevelOf(userId);
  return level ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Peran mana yang boleh DIBERIKAN seorang aktor.
 *
 * `roles.level` adalah tangga wewenang: 0 = super_admin … 9 = sub_user; makin
 * kecil makin tinggi. Aturannya satu kalimat: Anda hanya boleh memberikan peran
 * yang berada di bawah peran Anda sendiri, dan no pernah kepada diri sendiri.
 *
 * Tanpa ini, medan `role_kode` pada `PUT /users/:id` menerima name peran apa pun
 * dan menuliskannya begitu saja. Karena seseorang berhak menyunting datanya
 * sendiri, satu akun staf ber-izin `user.update` cukup mengirimkan
 * `{"role_kode":"super_admin"}` to record miliknya untuk menjadi super admin —
 * satu permintaan, tanpa halangan apa pun.
 */
async function assertBolehMemberiPeran(
  actor: AuthContext,
  targetUserId: string | null,
  roleKode: string,
): Promise<string> {
  const role = await repo.roleByKode(roleKode);
  if (!role) throw AppError.badRequest('Unknown role', 'rbac.unknown_role');
  if (isSuper(actor)) return role.id;

  // Menaikkan peran diri sendiri selalu ditolak, bahkan to peran yang lebih
  // rendah: satu-satunya reason melakukannya adalah untuk menghindari batas.
  if (targetUserId && targetUserId === actor.userId) {
    throw AppError.forbidden('You cannot change your own role', 'user.cannot_change_own_role');
  }

  const actorLevel = await levelOf(actor.userId);
  if (!bolehMemberiPeran(actorLevel, role.level)) {
    throw AppError.forbidden(
      'You cannot grant a role at or above your own',
      'user.role_escalation',
      { role: role.kode },
    );
  }
  return role.id;
}

/**
 * Menolak action terhadap akun yang wewenangnya lebih tinggi from pelaku.
 * Batas `created_by` di `detail()` saja no cukup: akun berperan tinggi bisa
 * saja created by staf yang kini lebih rendah, dan setelah itu tetap berada di
 * dalam sub-tree miliknya.
 */
async function assertTidakDilangkahi(actor: AuthContext, targetUserId: string): Promise<void> {
  if (isSuper(actor) || targetUserId === actor.userId) return;
  const [aktor, target] = await Promise.all([levelOf(actor.userId), levelOf(targetUserId)]);
  if (target < aktor) {
    throw AppError.forbidden('That account outranks yours', 'user.target_outranks_actor');
  }
}

/** Keamanan delegasi: izin target ⊆ izin pembuat. */
async function assertSubset(
  actor: AuthContext,
  perms: Array<{ module: string; action: string; effect: string }>,
): Promise<void> {
  if (isSuper(actor)) return;
  const offending = perms
    .filter((p) => p.effect === 'allow')
    .filter((p) => !actor.permissions.has(`${p.module}.${p.action}`));
  if (offending.length) {
    throw AppError.forbidden('You cannot grant a permission you do not hold yourself', 'user.permission_escalation', {
      ditolak: offending.map((p) => `${p.module}.${p.action}`),
    });
  }
}

export async function list(actor: AuthContext, p: PageParams, filters: repo.Filters) {
  // non-super_admin dibatasi to sub-tree created_by miliknya
  const subtreeOf = isSuper(actor) ? null : actor.userId;
  return repo.list(p, { ...filters, subtreeOf });
}

export async function detail(actor: AuthContext, id: string) {
  const u = await repo.detail(id);
  if (!u) throw AppError.notFound('User not found', 'user.not_found');
  if (!isSuper(actor) && u.id !== actor.userId && u.created_by !== actor.userId) {
    const descend = await repo.isDescendantOf(id, actor.userId);
    if (!descend) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  }
  return u;
}

export async function create(actor: AuthContext, input: CreateUserInput) {
  const roleId = await assertBolehMemberiPeran(actor, null, input.role_kode);
  const password_hash = await hashPassword(input.password);
  const { id } = await repo.insert({
    name_lengkap: input.name_lengkap,
    email: input.email ?? null,
    number_wa: input.number_wa ?? null,
    password_hash,
    role_id: roleId,
    status: input.status,
    created_by: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'create',
    entity: 'users',
    entityId: id,
    after: { role_kode: input.role_kode, status: input.status },
  });
  return repo.detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateUserInput) {
  const before = await detail(actor, id); // enforces scope
  await assertTidakDilangkahi(actor, id);
  const fields: Record<string, unknown> = {};
  if (input.name_lengkap !== undefined) fields.name_lengkap = input.name_lengkap;
  if (input.email !== undefined) fields.email = input.email;
  if (input.number_wa !== undefined) fields.number_wa = input.number_wa;
  if (input.status !== undefined) fields.status = input.status;
  if (input.role_kode !== undefined && input.role_kode !== before.role_kode) {
    fields.role_id = await assertBolehMemberiPeran(actor, id, input.role_kode);
  }
  await repo.update(id, fields);
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'update',
    entity: 'users',
    entityId: id,
    before: { status: before.status, role: before.role_kode },
    after: input,
  });
  return repo.detail(id);
}

export async function remove(actor: AuthContext, id: string) {
  await detail(actor, id); // scope check
  await assertTidakDilangkahi(actor, id);
  if (id === actor.userId) throw AppError.badRequest('You cannot delete your own account', 'user.cannot_delete_self');
  await repo.softDelete(id);
  await recordAudit({ userId: actor.userId, module: 'users', action: 'delete', entity: 'users', entityId: id });
}

export async function getPermissions(actor: AuthContext, id: string) {
  await detail(actor, id);
  const rows = await repo.permissionsOf(id);
  return rows;
}

export async function setPermissions(actor: AuthContext, id: string, input: SetPermissionsInput) {
  await detail(actor, id);
  // Menyunting checklist izin sendiri hanya berguna untuk melepas batasan yang
  // dipasang atasan — `deny` yang menyempitkan sebuah peran ada justru supaya
  // no bisa dilepas by pemiliknya.
  if (!isSuper(actor) && id === actor.userId) {
    throw AppError.forbidden('You cannot edit your own permissions', 'user.cannot_edit_own_permissions');
  }
  await assertTidakDilangkahi(actor, id);
  await assertSubset(actor, input.permissions);
  await repo.replaceUserPermissions(id, actor.userId, input.permissions);
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'set_permissions',
    entity: 'user_permissions',
    entityId: id,
    after: input.permissions,
  });
  return repo.permissionsOf(id);
}

export async function verify(actor: AuthContext, id: string, input: VerifyInput) {
  const u = await detail(actor, id);
  await assertTidakDilangkahi(actor, id);
  const newStatus = input.action === 'approve' ? 'active' : 'inactive';
  await repo.setStatus(id, newStatus);
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: `verify_${input.action}`,
    entity: 'users',
    entityId: id,
    before: { status: u.status },
    after: { status: newStatus },
    reason: input.reason ?? null,
  });
  return repo.detail(id);
}

// ── Self-service (profile & password sendiri) ──────────────────

export async function updateMe(actor: AuthContext, input: UpdateMeInput) {
  const fields: Record<string, unknown> = {};
  if (input.name_lengkap !== undefined) fields.name_lengkap = input.name_lengkap;
  if (input.number_wa !== undefined) fields.number_wa = input.number_wa;
  if (Object.keys(fields).length) {
    await repo.update(actor.userId, fields);
    await recordAudit({
      userId: actor.userId,
      module: 'users',
      action: 'update_me',
      entity: 'users',
      entityId: actor.userId,
      after: fields,
    });
  }
  return repo.detail(actor.userId);
}

const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_EXT: Record<UploadMyPhotoInput['mime_type'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** save photo profile (base64) to uploads/avatars dan catat path-nya di users.profile_picture. */
export async function uploadMyPhoto(actor: AuthContext, input: UploadMyPhotoInput) {
  let buffer: Buffer;
  try {
    // accept juga bentuk data URL ("data:image/png;base64,....").
    const raw = input.data_base64.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(raw, 'base64');
  } catch {
    throw AppError.badRequest('The image data is not valid', 'upload.image_invalid');
  }
  if (!buffer.length) throw AppError.badRequest('The image data is empty', 'upload.image_empty');
  if (buffer.length > AVATAR_MAX_BYTES) throw AppError.badRequest('The photo must be 2MB or smaller', 'upload.photo_max_2mb');

  const before = await repo.detail(actor.userId);
  if (!before) throw AppError.notFound('User not found', 'user.not_found');

  await mkdir(AVATAR_DIR, { recursive: true });
  const filename = `${actor.userId}-${Date.now()}.${AVATAR_EXT[input.mime_type]}`;
  await writeFile(path.join(AVATAR_DIR, filename), buffer);

  const fotoPath = `/uploads/avatars/${filename}`;
  await repo.update(actor.userId, { profile_picture: fotoPath });

  // delete file lama (best-effort, jangan gagalkan request).
  if (before.profile_picture?.startsWith('/uploads/avatars/')) {
    await unlink(path.join(AVATAR_DIR, path.basename(before.profile_picture))).catch(() => {});
  }

  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'update_me',
    entity: 'users',
    entityId: actor.userId,
    after: { profile_picture: fotoPath },
  });
  return repo.detail(actor.userId);
}

export async function changeMyPassword(actor: AuthContext, input: ChangeMyPasswordInput) {
  const row = await repo.passwordHashById(actor.userId);
  if (!row) throw AppError.notFound('User not found', 'user.not_found');
  const valid = await verifyPassword(input.password_lama, row.password_hash);
  if (!valid) throw AppError.unauthorized('Your current password is incorrect', 'auth.current_password_wrong');
  const password_hash = await hashPassword(input.password_baru);
  await repo.updatePasswordHash(actor.userId, password_hash);
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'change_password',
    entity: 'users',
    entityId: actor.userId,
  });
}

/**
 * Ganti email akun sendiri.
 *
 * Hanya super admin: akun lain diganti emailnya by admin lewat Users, karena
 * email adalah identitas login dan alamat pemulihan password. Super admin no
 * punya atasan yang bisa melakukannya, jadi ia mengganti sendiri — dengan
 * konfirmasi password saat ini supaya sesi yang tertinggal terbuka no cukup
 * untuk mengambil alih akun.
 *
 * Password salah dibalas 400, bukan 401: 401 membuat frontend menganggap sesi
 * habis dan mengeluarkan user.
 */
export async function changeMyEmail(actor: AuthContext, input: ChangeMyEmailInput) {
  if (!isSuper(actor)) {
    throw AppError.forbidden('Only a super admin can change their own email — ask an administrator', 'user.email_change_requires_super_admin');
  }
  const before = await repo.detail(actor.userId);
  if (!before) throw AppError.notFound('User not found', 'user.not_found');

  const row = await repo.passwordHashById(actor.userId);
  if (!row?.password_hash || !(await verifyPassword(input.password_saat_ini, row.password_hash))) {
    throw AppError.badRequest('Your current password is incorrect', 'auth.current_password_wrong');
  }
  if ((before.email ?? '').toLowerCase() === input.email) {
    throw AppError.badRequest('That is already your email address', 'user.email_unchanged');
  }
  if (await repo.emailTakenByOther(input.email, actor.userId)) {
    throw AppError.conflict('That email address is already used by another account', 'user.email_taken');
  }

  await repo.updateEmail(actor.userId, input.email);
  await recordAudit({
    userId: actor.userId,
    module: 'users',
    action: 'change_email',
    entity: 'users',
    entityId: actor.userId,
    before: { email: before.email },
    after: { email: input.email },
  });
  return repo.detail(actor.userId);
}

export async function roles() {
  return repo.listRoles();
}

export async function permissionsCatalog() {
  return repo.listPermissions();
}

export { loadEffectivePermissions };
