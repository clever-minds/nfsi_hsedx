import type { RouteRecordRaw } from 'vue-router';

// Rute modul Sertifikat & Gamifikasi (C.11). Path relatif terhadap parent `/d`.
export const certificatesRoutes: RouteRecordRaw[] = [
  {
    path: 'sertifikat',
    name: 'sertifikat',
    component: () => import('@/modules/certificates/views/MyCertificatesView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Sertifikat Saya' },
  },
  {
    path: 'sertifikat/lihat/:id',
    name: 'sertifikat-viewer',
    component: () => import('@/modules/certificates/views/CertificateViewerView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Sertifikat' },
  },
  {
    path: 'sertifikat/badge',
    name: 'sertifikat-badge',
    component: () => import('@/modules/certificates/views/BadgesView.vue'),
    meta: { permission: 'sertifikat.view', title: 'Badge & Gamifikasi' },
  },
  {
    path: 'sertifikat/template',
    name: 'sertifikat-template',
    component: () => import('@/modules/certificates/views/TemplateEditorView.vue'),
    meta: { permission: 'sertifikat.update', title: 'Template Sertifikat' },
  },
];
