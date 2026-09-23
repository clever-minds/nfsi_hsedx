/** Aksi permission kanonik (selaras enum `permission_action` di DB). */
export type PermissionAction = 'view' | 'create' | 'update' | 'delete';

/** String permission bentuk `module.action`, mis. `kursus.view`. */
export type PermissionKey = `${string}.${PermissionAction}`;

/** Kode peran kanonik. */
export type RoleKode =
  | 'super_admin'
  | 'direktur'
  | 'ketua'
  | 'pembina'
  | 'admin_ops'
  | 'instruktur'
  | 'asisten'
  | 'marketing'
  | 'siswa'
  | 'sub_user';

/** Identitas terautentikasi yang ditempel ke `req.auth`. */
export interface AuthContext {
  userId: string;
  role: RoleKode | string;
  roles: string[];
  permissions: Set<string>; // set of `module.action`
}
