import { StatusCodes } from 'http-status-codes';

/** One invalid field, matching the frontend's `ApiFieldError`. */
export interface ApiFieldError {
    message: string;
    path: string[];
}

/** An error with an HTTP status that the error handler returns to the client as-is. */
export class HttpError extends Error {
    statusCode: number;
    code?: string;
    errors?: ApiFieldError[];

    constructor(
        message: string,
        statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
        options: { code?: string; errors?: ApiFieldError[] } = {},
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = options.code;
        this.errors = options.errors;
        Object.setPrototypeOf(this, new.target.prototype);
    }

    static badRequest(message: string, errors?: ApiFieldError[]): HttpError {
        return new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'BAD_REQUEST', errors });
    }

    static unauthorized(message = 'Authentication required'): HttpError {
        return new HttpError(message, StatusCodes.UNAUTHORIZED, { code: 'UNAUTHORIZED' });
    }

    static forbidden(message = 'You do not have permission to perform this action'): HttpError {
        return new HttpError(message, StatusCodes.FORBIDDEN, { code: 'FORBIDDEN' });
    }

    static notFound(message = 'Resource not found'): HttpError {
        return new HttpError(message, StatusCodes.NOT_FOUND, { code: 'NOT_FOUND' });
    }

    static conflict(message: string, errors?: ApiFieldError[]): HttpError {
        return new HttpError(message, StatusCodes.CONFLICT, { code: 'CONFLICT', errors });
    }
}
