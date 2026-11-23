import express, { type Request, type Response, type NextFunction } from 'express';
import { HttpError, sameOrigin } from './auth.js';
import { planningOnlyGuard } from './settings.js';
import { loginRouter } from './login.js';
import { worksRouter } from './works.js';
import { delegatesRouter } from './delegates.js';
import { moderationRouter } from './moderation.js';
import { correctionsRouter } from './corrections.js';

// Travaux API: every route shares the same checks (same origin, planning-only switch, no cache),
// then each domain lives in its own module.
const router = express.Router();
const paths = ['/auth', '/account', '/travaux'];
router.use(paths, sameOrigin);
router.use(paths, planningOnlyGuard);
router.use(paths, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(loginRouter, worksRouter, delegatesRouter, moderationRouter, correctionsRouter);
router.use(paths, (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  next(error);
});
export const travauxRouter = router;
