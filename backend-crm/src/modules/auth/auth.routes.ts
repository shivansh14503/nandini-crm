import { Router } from 'express';
import { getMe, login, logout } from './auth.controller.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { loginRateLimit } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { loginSchema } from './auth.validator.js';

const router = Router();

// POST /api/auth/login — failed attempts are rate limited per IP (ratelimit:login:{ip}).
router.post('/login', loginRateLimit.guard, validateRequest({ body: loginSchema }), login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

export default router;
