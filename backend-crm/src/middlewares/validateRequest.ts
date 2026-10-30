import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

export interface RequestSchemas {
    body?: z.ZodType;
    query?: z.ZodType;
    params?: z.ZodType;
}

/**
 * Validates and normalizes `req.body`, `req.query` and `req.params` with Zod. Parsed values replace the
 * originals, so handlers receive trimmed / coerced / defaulted data. A ZodError is forwarded to the error
 * handler, which turns it into a 400 with per-field `errors`.
 */
export function validateRequest(schemas: RequestSchemas) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
        if (schemas.query) {
            // Express 5 exposes `req.query` as a getter; shadow it with the parsed value.
            Object.defineProperty(req, 'query', {
                value: schemas.query.parse(req.query),
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }
        if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
        next();
    };
}
