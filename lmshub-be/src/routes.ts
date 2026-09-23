import { Router } from 'express';
import { ok } from './core/http/envelope';
import { pool } from './core/db/pool';
import { asyncHandler } from './core/http/asyncHandler';

// ── Module routers ──
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { instructorsRouter } from './modules/instructors/instructors.routes';
import { curriculumRouter } from './modules/curriculum/curriculum.routes';
import { mediaRouter } from './modules/media/media.routes';
import { enrollmentsRouter } from './modules/enrollments/enrollments.routes';
import { progressRouter } from './modules/progress/progress.routes';
import { assessmentsRouter } from './modules/assessments/assessments.routes';
import { gradingRouter } from './modules/grading/grading.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { marketingRouter } from './modules/marketing/marketing.routes';
import { liveRouter } from './modules/live/live.routes';
import { discussionsRouter } from './modules/discussions/discussions.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import { certificatesRouter } from './modules/certificates/certificates.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { documentsRouter, publicDocumentsRouter } from './modules/documents/documents.routes';
import { installRouter } from './modules/install/install.routes';
import { bankAccountsRouter } from './modules/bank-accounts/bank-accounts.routes';
import { currenciesRouter } from './modules/currencies/currencies.routes';
import { siteContentRouter } from './modules/site-content/site-content.routes';

export const apiRouter = Router();

// Health & readiness
apiRouter.get('/health', (_req, res) => ok(res, { status: 'ok', service: 'lmshub-be' }));
apiRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    let db = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch {
      db = false;
    }
    return ok(res, { status: db ? 'ready' : 'degraded', db });
  }),
);

// Resource-prefixed modules
// Installer — PUBLIC, dan harus paling awal: dijalankan sebelum ada akun mana
// pun, jadi router ber-requireAuth di bawah akan membalas 401 sebelum wizard
// sempat membaca statusnya sendiri. Tiap handler tetap menolak sendiri begitu
// sistem terpasang.
apiRouter.use('/', installRouter);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/instructors', instructorsRouter);
apiRouter.use('/media', mediaRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/marketing', marketingRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/discussions', discussionsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/bank-accounts', bankAccountsRouter);
apiRouter.use('/currencies', currenciesRouter);
apiRouter.use('/site-content', siteContentRouter);

// Modules yang mendefinisikan path absolut (mount di root /api/v1).
// certificatesRouter didahulukan karena punya rute PUBLIK (`/public/certificates/verify/:nomor`);
// router root lain (mis. progress) memasang requireAuth() global sehingga akan mencegat
// request publik bila dipasang lebih dulu.
apiRouter.use('/', publicDocumentsRouter); // halaman statis & setting publik — harus sebelum router ber-requireAuth global
apiRouter.use('/', certificatesRouter);
apiRouter.use('/', reviewsRouter); // sebelum router root ber-requireAuth global agar GET ulasan tetap publik
apiRouter.use('/', curriculumRouter);
apiRouter.use('/', enrollmentsRouter);
apiRouter.use('/', progressRouter);
apiRouter.use('/', assessmentsRouter);
apiRouter.use('/', gradingRouter);
apiRouter.use('/', liveRouter);
apiRouter.use('/', reportsRouter);
apiRouter.use('/', documentsRouter);
