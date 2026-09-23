import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import * as ctrl from './install.controller';

/**
 * PUBLIC by necessity — the installer runs before any account exists.
 *
 * Must be mounted before the routers that apply `requireAuth()`, or every step
 * answers 401 and the wizard cannot even read its own status. Each handler
 * re-checks `assertNotInstalled()` itself rather than trusting placement.
 */
export const installRouter = Router();

installRouter.get('/install/status', asyncHandler(ctrl.status));
installRouter.post('/install/database', asyncHandler(ctrl.testDatabase));
installRouter.post('/install/migrate', asyncHandler(ctrl.migrate));
installRouter.post('/install/finish', asyncHandler(ctrl.finish));
