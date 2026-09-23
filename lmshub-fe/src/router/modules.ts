import type { RouteRecordRaw } from 'vue-router';

// Rute modul dashboard (anak dari /d). Diagregasi dari tiap modul.
import { usersRoutes } from '@/modules/users/users.routes';
import { coursesRoutes } from '@/modules/courses/courses.routes';
import { contentRoutes } from '@/modules/content/content.routes';
import { enrollmentRoutes } from '@/modules/enrollment/enrollment.routes';
import { learnRoutes } from '@/modules/learn/learn.routes';
import { assessmentsRoutes } from '@/modules/assessments/assessments.routes';
import { gradingRoutes } from '@/modules/grading/grading.routes';
import { ordersRoutes } from '@/modules/orders/orders.routes';
import { marketingRoutes } from '@/modules/marketing/marketing.routes';
import { reportsRoutes } from '@/modules/reports/reports.routes';
import { settingsRoutes } from '@/modules/settings/settings.routes';
import { websiteRoutes } from '@/modules/website/website.routes';
import { auditRoutes } from '@/modules/audit/audit.routes';
import { liveRoutes } from '@/modules/live/live.routes';
import { discussionsRoutes } from '@/modules/discussions/discussions.routes';
import { certificatesRoutes } from '@/modules/certificates/certificates.routes';
import { notificationsRoutes } from '@/modules/notifications/notifications.routes';

export const moduleRoutes: RouteRecordRaw[] = [
  ...usersRoutes,
  ...coursesRoutes,
  ...contentRoutes,
  ...enrollmentRoutes,
  ...learnRoutes,
  ...assessmentsRoutes,
  ...gradingRoutes,
  ...ordersRoutes,
  ...marketingRoutes,
  ...reportsRoutes,
  ...settingsRoutes,
  ...websiteRoutes,
  ...auditRoutes,
  ...liveRoutes,
  ...discussionsRoutes,
  ...certificatesRoutes,
  ...notificationsRoutes,
];
