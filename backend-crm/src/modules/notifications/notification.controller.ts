import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { previewMorningSummary, sendTestMorningSummary } from './morningSummary.service.js';
import { notificationService } from './notification.service.js';

export const notificationController = {
    /** `{ success, data: NotificationDto[], nextCursor, unreadCount }` (page fields beside `data`, like sendPaginated). */
    async list(req: Request, res: Response): Promise<void> {
        const page = await notificationService.list(req.query, requireUser(req));
        res.status(StatusCodes.OK).json({ success: true, data: page.data, nextCursor: page.nextCursor, unreadCount: page.unreadCount });
    },

    async unreadCount(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await notificationService.unreadCount(requireUser(req)));
    },

    async markRead(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await notificationService.markRead(String(req.params.id), requireUser(req)));
    },

    async markAllRead(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await notificationService.markAllRead(requireUser(req)));
    },

    async previewMorningSummary(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await previewMorningSummary(requireUser(req)));
    },

    async testMorningSummary(req: Request, res: Response): Promise<void> {
        const result = await sendTestMorningSummary(requireUser(req));
        sendSuccess(res, result, result.message);
    },
};
