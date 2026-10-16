import { Router } from 'express';
import { getMe, login, logout } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authMiddleware.ts';

const router = Router();

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);


export default router;
