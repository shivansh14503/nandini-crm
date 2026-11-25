import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { notificationController } from './notification.controller.js';

/**
 * /api/notifications (the signed-in user's own notifications; personal rows, not audited; docs/api-plan.md)
 *   GET  /                          ?unreadOnly&limit (1–50, default 20)&before=<createdAt ISO>|<id>
 *                                   → { data: NotificationDto[], nextCursor, unreadCount } (newest first)
 *   GET  /unread-count              → { count } (served from Redis; the bell polls it)
 *   POST /read-all                  → { updated }
 *   POST /:id/read                  → { id, readAt } (404 when not the caller's)
 *   GET  /morning-summary/preview   → { subject, html, text, counts, empty, mailEnabled, email } for the caller, today;
 *                                     sends nothing (works with mail turned off)
 *   POST /morning-summary/test      (admin roles) sends the caller's summary to their own address now
 *                                   → { status, error?, email, message }; 400 when mail is off or they have no email
 */
const router = Router();
router.use(authenticate);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/read-all', notificationController.markAllRead);
router.get('/morning-summary/preview', notificationController.previewMorningSummary);
router.post('/morning-summary/test', requireRole(...FORM_CONFIG_ADMIN_ROLES), notificationController.testMorningSummary);
router.post('/:id/read', validateRequest({ params: idParamSchema }), notificationController.markRead);

export default router;
