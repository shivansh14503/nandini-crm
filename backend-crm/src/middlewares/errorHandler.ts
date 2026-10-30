import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';
import { HttpError, type ApiFieldError } from '../utils/httpError.js';
import { isTransactionUnavailableError, isWriteConflictError } from '../utils/prismaErrors.js';

// Re-exported so existing imports from this module keep working.
export { HttpError } from '../utils/httpError.js';

/** Error body matching the frontend's `ApiError` (`{ status: 'error', message, code?, errors? }`). */
interface ErrorBody {
    status: 'error';
    message: string;
    code?: string;
    errors?: ApiFieldError[];
}

/** Best-effort list of the columns behind a unique / FK violation; the meta shape varies with driver adapters. */
function constraintFields(error: Prisma.PrismaClientKnownRequestError): string | undefined {
    const meta = error.meta as Record<string, unknown> | undefined;
    const target = meta?.target ?? (meta?.driverAdapterError as { cause?: { constraint?: unknown } } | undefined)?.cause?.constraint;
    if (Array.isArray(target)) return target.join(', ');
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object' && 'fields' in target && Array.isArray(target.fields)) return target.fields.join(', ');
    return undefined;
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): [number, ErrorBody] | null {
    // Only reached once runInTransaction / runSerializable retries are exhausted.
    if (isWriteConflictError(error)) {
        return [StatusCodes.CONFLICT, {
            status: 'error',
            code: 'WRITE_CONFLICT',
            message: 'This record was changed by another request at the same time. Please try again.',
        }];
    }
    if (isTransactionUnavailableError(error)) {
        return [StatusCodes.SERVICE_UNAVAILABLE, {
            status: 'error',
            code: 'SERVER_BUSY',
            message: 'The server is busy right now. Please try again in a moment.',
        }];
    }
    switch (error.code) {
        case 'P2002': {
            const fields = constraintFields(error);
            return [StatusCodes.CONFLICT, {
                status: 'error',
                code: 'DUPLICATE_RECORD',
                message: fields ? `A record with the same ${fields} already exists.` : 'A record with these details already exists.',
            }];
        }
        case 'P2025':
            return [StatusCodes.NOT_FOUND, { status: 'error', code: 'NOT_FOUND', message: 'The requested record was not found.' }];
        case 'P2003':
            return [StatusCodes.CONFLICT, {
                status: 'error',
                code: 'RELATED_RECORD_CONSTRAINT',
                message: 'This record is linked to another record that does not exist or still references it.',
            }];
        case 'P2000':
            return [StatusCodes.BAD_REQUEST, { status: 'error', code: 'VALUE_TOO_LONG', message: 'A value is too long for its field.' }];
        default:
            return null;
    }
}

/** Express-generated client errors (bad JSON, oversized body) carry `status` + `expose`. */
function isClientHttpError(err: unknown): err is Error & { status: number; expose: boolean; type?: string } {
    return err instanceof Error && typeof (err as { status?: unknown }).status === 'number' && (err as { expose?: unknown }).expose === true;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { status: 'error', message: 'Internal Server Error' };

    if (err instanceof HttpError) {
        statusCode = err.statusCode;
        body = { status: 'error', message: err.message, code: err.code, errors: err.errors };
    } else if (err instanceof ZodError) {
        statusCode = StatusCodes.BAD_REQUEST;
        body = {
            status: 'error',
            code: 'VALIDATION_ERROR',
            message: err.issues[0]?.message ?? 'Validation failed',
            errors: err.issues.map((issue) => ({ message: issue.message, path: issue.path.map(String) })),
        };
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = fromPrismaError(err);
        if (mapped) [statusCode, body] = mapped;
        if (statusCode === StatusCodes.SERVICE_UNAVAILABLE) res.setHeader('Retry-After', '2');
    } else if (isClientHttpError(err)) {
        statusCode = err.status;
        body = {
            status: 'error',
            code: err.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'BAD_REQUEST',
            message: err.type === 'entity.parse.failed' ? 'Request body is not valid JSON.' : err.message,
        };
    }

    if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
        logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
        // Internals stay out of production responses; development keeps the real message for debugging.
        if (!ENV.IS_PRODUCTION && err instanceof Error && !(err instanceof HttpError)) body.message = err.message;
    } else {
        logger.debug({ statusCode, code: body.code, url: req.originalUrl }, body.message);
    }

    res.status(statusCode).json(body);
}

/** 404 for unmatched routes, in the same error shape. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
    next(HttpError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
