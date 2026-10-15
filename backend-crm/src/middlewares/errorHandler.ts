import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

export interface AppError extends Error {
    statusCode?: number;
}

export class HttpError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export function errorHandler(
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void {
    const statusCode = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err.message ?? 'Internal Server Error';

    console.error(`[Error] ${statusCode}: ${message}`);

    res.status(statusCode).json({
        status: 'error',
        message,
    });
}
