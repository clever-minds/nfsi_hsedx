import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { translateLegacyPath } from './legacyPaths';

// Rute pra-login (publik) + dashboard. Modul tambahan didaftarkan lewat moduleRoutes.
import { moduleRoutes } from './modules';

const routes: RouteRecordRaw[] = [
  // ── Area pra-login (publik) ──
  {
    path: '/',
    component: () => import('@/layouts/PublicLayout.vue'),
    children: [
      { path: '', name: 'landing', component: () => import('@/modules/catalog/views/LandingView.vue') },
      { path: 'courses', name: 'catalog', component: () => import('@/modules/catalog/views/CatalogView.vue') },
      {
        path: 'courses/:slug',
        name: 'course-detail',
        component: () => import('@/modules/catalog/views/CourseDetailView.vue'),
      },
      {
        path: 'instructors',
        name: 'instructor-list',
        component: () => import('@/modules/catalog/views/InstructorListView.vue'),
      },
      {
        path: 'instructors/:id',
        name: 'instructor-detail',
        component: () => import('@/modules/catalog/views/InstructorDetailView.vue'),
      },
      // Halaman statis (About, Terms, …) yang managed di Website → Pages.
      {
        path: 'pages/:slug',
        name: 'static-page',
        component: () => import('@/modules/catalog/views/StaticPageView.vue'),
      },
      {
        path: 'certificates/:number',
        name: 'verify-certificate',
        component: () => import('@/modules/catalog/views/PublicCertificateView.vue'),
      },
      // Pendaratan setelah pembeli back from gateway. Publik: gateway bisa
      // memulangkan pembeli di browser yang sesinya sudah kedaluwarsa.
      {
        path: 'payment/return',
        name: 'payment-return',
        component: () => import('@/modules/orders/views/PaymentResultView.vue'),
        props: { outcome: 'return' },
      },
      {
        path: 'payment/cancel',
        name: 'payment-cancel',
        component: () => import('@/modules/orders/views/PaymentResultView.vue'),
        props: { outcome: 'cancel' },
      },
    ],
  },
  { path: '/login', name: 'login', component: () => import('@/modules/auth/views/LoginView.vue'), meta: { guestOnly: true } },
  { path: '/register', name: 'register', component: () => import('@/modules/auth/views/RegisterView.vue'), meta: { guestOnly: true } },
  { path: '/verify-email', name: 'verify-email', component: () => import('@/modules/auth/views/VerifyEmailView.vue') },

  // ── Area terkunci (dashboard) ──
  {
    path: '/d',
    component: () => import('@/layouts/DashboardLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: () => import('@/modules/dashboard/views/DashboardHome.vue') },
      // Catalog di dalam dashboard (komponen sama dengan catalog publik, link menyesuaikan)
      { path: 'catalog', name: 'dash-catalog', component: () => import('@/modules/catalog/views/CatalogView.vue') },
      {
        path: 'catalog/:slug',
        name: 'dash-course-detail',
        component: () => import('@/modules/catalog/views/CourseDetailView.vue'),
      },
      ...moduleRoutes,
    ],
  },

  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFound.vue') },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  // A pre-English URL (bookmark, old email, certificate QR code) lands on
  // not-found; send it to the page it used to mean.
  if (to.name === 'not-found') {
    const english = translateLegacyPath(to.path);
    if (english !== to.path) return { path: english, query: to.query, hash: to.hash, replace: true };
  }

  const auth = useAuthStore();
  if (!auth.ready) await auth.bootstrap();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  if (to.meta.permission && !auth.can(to.meta.permission as string)) {
    return { name: 'dashboard' };
  }
  const hideForRoles = to.meta.hideForRoles as string[] | undefined;
  if (hideForRoles?.some((r) => auth.roles.includes(r))) {
    return { name: 'dashboard' };
  }
  return true;
});
