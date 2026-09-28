import type { RouteRecordRaw } from 'vue-router';

// Rute modul Sertifikat & Gamifikasi (C.11). Path relatif terhadap parent `/d`.
export const certificatesRoutes: RouteRecordRaw[] = [
  {
    path: 'certificates',
    name: 'sertifikat',
    component: () => import('@/modules/certificates/views/MyCertificatesView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Sertifikat Saya' },
  },
  {
    path: 'certificates/view/:id',
    name: 'sertifikat-viewer',
    component: () => import('@/modules/certificates/views/CertificateViewerView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Sertifikat' },
  },
  {
    path: 'certificates/badges',
    name: 'sertifikat-badge',
    component: () => import('@/modules/certificates/views/BadgesView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Badge & Gamifikasi' },
  },
  {
    path: 'certificates/template',
    name: 'sertifikat-template',
    component: () => import('@/modules/certificates/views/TemplateEditorView.vue'),
    meta: { permission: 'sertifikat.update', title: 'Template Sertifikat' },
  },
];
