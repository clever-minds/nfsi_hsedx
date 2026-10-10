/** action permission kanonik (selaras enum `permission_action` di DB). */
export type PermissionAction = 'view' | 'create' | 'update' | 'delete';

/** String permission bentuk `module.action`, mis. `course.view`. */
export type PermissionKey = `${string}.${PermissionAction}`;

/** Kode peran kanonik. */
export type RoleKode =
  | 'super_admin'
  | 'director'
  | 'chairperson'
  | 'supervisor'
  | 'operations_admin'
  | 'instructor'
  | 'assistant'
  | 'marketing'
  | 'student'
  | 'sub_user';

/** Identitas terautentikasi yang ditempel to `req.auth`. */
export interface AuthContext {
  userId: string;
  role: RoleKode | string;
  roles: string[];
  permissions: Set<string>; // set of `module.action`
}
