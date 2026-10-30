import type { Response } from 'express';
import { StatusCodes } from 'http-status-codes';

/**
 * Response envelopes matching frontend-crm/src/types/api.types.ts:
 * `ApiResponse<T>` for single items / mutations and `PaginatedResponse<T>` for lists.
 */

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode: number = StatusCodes.OK): Response {
    return res.status(statusCode).json({ success: true, data, ...(message ? { message } : {}) });
}

export function sendCreated<T>(res: Response, data: T, message?: string): Response {
    return sendSuccess(res, data, message, StatusCodes.CREATED);
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

export function sendPaginated<T>(res: Response, result: PaginatedResult<T>): Response {
    return res.status(StatusCodes.OK).json({
        success: true,
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
    });
}
