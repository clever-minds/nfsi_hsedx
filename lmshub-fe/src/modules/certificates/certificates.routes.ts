import type { RouteRecordRaw } from 'vue-router';

// Rute modul Certificate & Gamifikasi (C.11). Path relatif terhadap parent `/d`.
export const certificatesRoutes: RouteRecordRaw[] = [
  {
    path: 'certificates',
    name: 'certificates',
    component: () => import('@/modules/certificates/views/MyCertificatesView.vue'),
    meta: { permission: 'certificate.view', title: 'My Certificates' },
  },
  {
    path: 'certificates/view/:id',
    name: 'certificate-viewer',
    component: () => import('@/modules/certificates/views/CertificateViewerView.vue'),
    meta: { permission: 'certificate.view', title: 'Certificates' },
  },
  {
    path: 'certificates/badges',
    name: 'certificate-badges',
    component: () => import('@/modules/certificates/views/BadgesView.vue'),
    meta: { permission: 'certificate.view', title: 'Badges & Gamification' },
  },
  {
    path: 'certificates/templates',
    name: 'certificate-templates',
    component: () => import('@/modules/certificates/views/TemplateEditorView.vue'),
    meta: { permission: 'certificate.update', title: 'Certificate Templates' },
  },
];
