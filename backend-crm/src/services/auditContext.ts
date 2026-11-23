import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Who / where / how of every audit entry, captured once per request (or import / job run) instead of being passed
 * through every service call. `auditContextMiddleware` opens the context as the first middleware; `auditService`
 * reads it when it writes an entry, so the ~70 existing audit calls get the context without changes.
 * Node's AsyncLocalStorage carries it through express.json() and every await of the request.
 */

/** Where a change came from: the CRM web app, any other API client, an import, or a background job. */
export type AuditSource = 'UI' | 'API' | 'IMPORT' | 'JOB';

export interface AuditOrigin {
    /** Shared by every entry one request, import or job run writes (also the `X-Request-Id` header and log `req.id`). */
    requestId: string;
    source: AuditSource;
    actorId?: number;
    actorRole?: string;
    /** Sign-in session (JWT id). */
    sessionId?: string;
    httpMethod?: string;
    /** Route pattern (`/api/leads/:id`), or `job:<name>` for background jobs. */
    route?: string;
    /** Screen the user was on, sent by the web app. */
    page?: string;
    ipAddress?: string;
    userAgent?: string;
}

interface Store {
    origin: AuditOrigin;
    /** The live request: the signed-in user and the matched route are only known after later middleware runs. */
    req?: Request;
    /** Set while an audit entry is being undone: the change it makes to that record is written as a REVERT of it. */
    revertOf?: RevertTarget;
}

/** The audit entry being undone and the record it is about. */
export interface RevertTarget {
    id: string;
    entityType: string;
    entityId: string;
}

const storage = new AsyncLocalStorage<Store>();

/** Sent by the web app (`frontend-crm/src/services/apiClient.ts`): `web`, so its changes are tagged source UI. */
export const CLIENT_HEADER = 'x-crm-client';
/** Sent by the web app: the path of the screen the request came from. */
export const PAGE_HEADER = 'x-crm-page';
export const REQUEST_ID_HEADER = 'X-Request-Id';

const clip = (value: string | undefined, max: number): string | undefined => (value ? value.slice(0, max) : undefined);

/** `::ffff:10.0.0.5` (IPv4 seen through an IPv6 socket) → `10.0.0.5`. */
export function normalizeIp(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    return clip(ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip, 45);
}

/** The screen path the web app sent: a same-site path only (never a full URL), without query string or hash. */
export function normalizePage(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const path = value.trim().split(/[?#]/)[0];
    if (!path.startsWith('/') || path.startsWith('//')) return undefined;
    return clip(path, 300);
}

/** `/api/leads/:id` once a route matched; the bare path (ids included) while still in router-level middleware. */
function routePattern(req: Request): string | undefined {
    const path = (req.route as { path?: unknown } | undefined)?.path;
    if (typeof path === 'string') return clip(`${req.baseUrl}${path}`, 200);
    return clip(req.originalUrl.split('?')[0], 200);
}

/** First middleware: gives every request an id (response header, log lines, audit entries) and opens its context. */
export function auditContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    // pino-http uses an existing req.id for the log line, so logs and audit entries share the id.
    (req as Request & { id?: string }).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    const origin: AuditOrigin = {
        requestId,
        source: req.get(CLIENT_HEADER) === 'web' ? 'UI' : 'API',
        httpMethod: req.method,
        page: normalizePage(req.get(PAGE_HEADER)),
        userAgent: clip(req.get('user-agent'), 400),
    };
    storage.run({ origin, req }, next);
}

/** The current request's (or import's / job's) origin, with the signed-in user and route as known right now. */
export function currentAuditOrigin(): AuditOrigin | undefined {
    const store = storage.getStore();
    if (!store) return undefined;
    const { origin, req } = store;
    if (!req) return { ...origin };
    return {
        ...origin,
        actorId: origin.actorId ?? req.user?.id,
        actorRole: origin.actorRole ?? req.user?.role,
        sessionId: origin.sessionId ?? req.auth?.jti,
        route: routePattern(req) ?? origin.route,
        ipAddress: normalizeIp(req.ip),
    };
}

/**
 * Runs `fn` under a fixed origin (an import, a background job): every entry it writes carries this origin and shares
 * one `requestId` (a new one unless given). Works inside a request too, e.g. an import run inline.
 */
export function runWithAuditOrigin<T>(origin: Partial<AuditOrigin> & Pick<AuditOrigin, 'source'>, fn: () => T): T {
    return storage.run({ origin: { ...origin, requestId: origin.requestId ?? randomUUID() } }, fn);
}

/**
 * Runs `fn` (a module's normal update) as the undo of audit entry `target`: the update entry it writes for that
 * record becomes a `REVERT` pointing at the entry (audit.service.ts), with the request's own who / where / how.
 */
export function runAsRevertOf<T>(target: RevertTarget, fn: () => T): T {
    const store = storage.getStore();
    return storage.run({ origin: store?.origin ?? { requestId: randomUUID(), source: 'API' }, req: store?.req, revertOf: target }, fn);
}

/** The audit entry the current code is undoing, if any. */
export const currentRevertTarget = (): RevertTarget | undefined => storage.getStore()?.revertOf;
