import type { RouteRecordRaw } from 'vue-router';

export const auditRoutes: RouteRecordRaw[] = [
  {
    path: 'audit',
    name: 'audit',
    component: () => import('@/modules/audit/views/AuditLogView.vue'),
    meta: { permission: 'audit.view', title: 'Audit Log' },
  },
];
