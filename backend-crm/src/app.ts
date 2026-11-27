import type { Server } from 'node:http';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ENV } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, prisma, startDatabaseKeepAlive, stopDatabaseKeepAlive } from './config/prisma.js';
import { connectRedis, isRedisReady, redis } from './config/redis.js';
import { cacheService } from './services/cache.service.js';
import { auditContextMiddleware, REQUEST_ID_HEADER } from './services/auditContext.js';
import authRouter from './modules/auth/auth.routes.js';
import productRouter from './modules/products/product.routes.js';
import organizationRouter from './modules/organizations/organization.routes.js';
import contactRouter from './modules/contacts/contact.routes.js';
import leadRouter from './modules/leads/lead.routes.js';
import opportunityRouter from './modules/opportunities/opportunity.routes.js';
import quotationRouter from './modules/quotations/quotation.routes.js';
import ticketRouter from './modules/tickets/ticket.routes.js';
import contractRouter from './modules/contracts/contract.routes.js';
import activityRouter from './modules/activities/activity.routes.js';
import documentRouter from './modules/documents/document.routes.js';
import referralRouter from './modules/referrals/referral.routes.js';
import partnerCompanyRouter from './modules/partner-companies/partnerCompany.routes.js';
import searchRouter from './modules/search/search.routes.js';
import lookupRouter from './modules/lookups/lookup.routes.js';
import cityRouter from './modules/cities/city.routes.js';
import auditRouter from './modules/audit/audit.routes.js';
import auditAdminRouter from './modules/audit/auditAdmin.routes.js';
import importRouter from './modules/imports/import.routes.js';
import formConfigRouter from './modules/form-configs/formConfig.routes.js';
import documentSeriesRouter from './modules/document-series/documentSeries.routes.js';
import companyFormatsRouter from './modules/company-formats/companyFormats.routes.js';
import holidayRouter from './modules/holidays/holiday.routes.js';
import emailValidationRouter from './modules/email-verification/emailValidation.routes.js';
import { resumeEmailValidationRuns } from './modules/email-verification/emailValidation.admin.service.js';
import tableFilterRouter from './modules/table-filters/tableFilter.routes.js';
import scorecardRouter from './modules/scorecards/scorecard.routes.js';
import notificationRouter from './modules/notifications/notification.routes.js';
import { dropUnreadCountsOnRedisReady } from './modules/notifications/notification.producer.js';
import { drawerLayoutRouter, drawerPieceRouter } from './modules/drawer-layouts/drawerLayout.routes.js';
import { seedFormConfigsSafely } from './modules/form-configs/formConfig.seed.js';
import { loadProductCatalogSheetSafely } from './modules/products/productCatalog.load.js';
import { pdfAssetRouter, pdfSavedItemRouter, pdfTemplateRouter } from './modules/pdf/pdf.routes.js';
import recordFileRouter from './modules/files/recordFile.routes.js';
import profileRouter from './modules/profile/profile.routes.js';
import userPhotoRouter from './modules/profile/userPhoto.routes.js';
import { seedPdfTemplatesSafely } from './modules/pdf/pdfTemplate.seed.js';
import { shutdownPdfRenderer } from './modules/pdf/renderer/puppeteerRenderer.js';
import { closeMail } from './services/mail.service.js';
import { closeQueues } from './jobs/queues.js';
import { startWorkers, stopWorkers } from './jobs/workers/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import integrationRouter from './modules/integrations/integration.routes.js';
import userAdminRouter from './modules/user-admin/userAdmin.routes.js';
import roleRouter from './modules/roles/role.routes.js';
import { seedRolesSafely } from './modules/roles/roleSeed.js';
import { serializeRequestForLog } from './utils/redactUrl.js';
import { isAppOrigin } from './config/origins.js';
import calendarConnectionRouter from './modules/calendar-sync/connection.routes.js';
import calendarWebhookRouter from './modules/calendar-sync/webhook.routes.js';
import bookingLinkRouter from './modules/booking-links/bookingLink.routes.js';
import publicBookingRouter from './modules/booking-links/bookingLink.public.routes.js';
import emailLogRouter from './modules/email-log/emailLog.routes.js';
import emailLogAdminRouter from './modules/email-log/emailLogAdmin.routes.js';

const app: Express = express();

// Behind Azure App Service / a reverse proxy, trust one hop so req.ip (rate limiting, sessions) is the client's.
if (ENV.IS_PRODUCTION) app.set('trust proxy', 1);

// ── Global Middleware ──────────────────────────────────────────────────────────
// First: a request id (X-Request-Id, log req.id) and the audit context every audit entry reads its who / where from.
app.use(auditContextMiddleware);
app.use(helmet());
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (!ENV.IS_PRODUCTION || isAppOrigin(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        // The frontend reads the server's PDF file name, rate-limit retry hints and the request id (error reference).
        exposedHeaders: ['Content-Disposition', 'Retry-After', REQUEST_ID_HEADER],
    }),
);
app.use(
    pinoHttp({
        logger,
        // Health probes would otherwise flood the logs.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        // OAuth codes / state, webhook validation tokens and provider sync cursors never reach a log line: the URL and
        // the parsed query / params the standard req serializer adds are all masked (redactUrl.ts).
        serializers: { req: serializeRequestForLog },
    }),
);
// Calendar webhooks from Google / Microsoft (Calendar Phase 2 P2-7): no session, signature-verified; mounted before the
// cookie and body parsers with their own (Google: headers only; Graph: JSON ≤ 256 KB), their own rate limit.
app.use('/api/webhooks', calendarWebhookRouter);
app.use(cookieParser());
// Mounted before the global body parser: imports carry up to 5,000 rows and parse with their own 10 MB limit.
app.use('/api/import', importRouter);
// PDF template documents, saved library items and logo uploads (base64) parse with their own 2 MB limit.
app.use('/api/pdf-templates', pdfTemplateRouter);
app.use('/api/pdf-assets', pdfAssetRouter);
app.use('/api/pdf-saved-items', pdfSavedItemRouter);
// Record field uploads (an opportunity's Upload Doc, base64) parse with their own 15 MB limit (10 MB files).
app.use('/api/files', recordFileRouter);
// Public booking pages (no sign-in; Calendar Phase 4): own 16 KB parser, rate limits per IP and per link.
app.use('/api/public/booking', publicBookingRouter);
app.use(express.json({ limit: '1mb' }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        message: 'CRM API is running',
        redis: isRedisReady() ? 'connected' : 'unavailable',
    });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/leads', leadRouter);
app.use('/api/opportunities', opportunityRouter);
app.use('/api/quotations', quotationRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/contracts', contractRouter);
app.use('/api/activities', activityRouter);
app.use('/api/documents', documentRouter);
app.use('/api/referrals', referralRouter);
app.use('/api/partner-companies', partnerCompanyRouter);
app.use('/api/search', searchRouter);
app.use('/api/lookups', lookupRouter);
app.use('/api/cities', cityRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/admin/audit-logs', auditAdminRouter);
app.use('/api/form-configs', formConfigRouter);
app.use('/api/document-series', documentSeriesRouter);
app.use('/api/company-formats', companyFormatsRouter);
app.use('/api/holidays', holidayRouter);
app.use('/api/email-validation', emailValidationRouter);
app.use('/api/table-filters', tableFilterRouter);
app.use('/api/scorecards', scorecardRouter);
app.use('/api/drawer-layouts', drawerLayoutRouter);
app.use('/api/drawer-pieces', drawerPieceRouter);
app.use('/api/notifications', notificationRouter);
// My Profile (a photo upload is ≤ 512 KB, about 700 KB as base64, so it fits the global 1 MB parser).
app.use('/api/me', profileRouter);
app.use('/api/user-photos', userPhotoRouter);
app.use('/api/admin/integrations', integrationRouter);
app.use('/api/admin/users', userAdminRouter);
app.use('/api/admin/roles', roleRouter);
app.use('/api/calendar-connections', calendarConnectionRouter);
app.use('/api/booking-links', bookingLinkRouter);
app.use('/api/email-logs', emailLogRouter);
app.use('/api/admin/email-logging', emailLogAdminRouter);

// ── 404 + global error handler ─────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start: database must be reachable; Redis connects in the background ────────
async function start(): Promise<Server> {
    if (ENV.USING_DEV_JWT_SECRET) {
        logger.warn('JWT_SECRET is not set; using an insecure development secret');
    }
    logIntegrationsReadiness();
    // Cached form configuration, lookups, search and dashboards can predate a migration (renamed field keys,
    // labels): drop them once Redis is up so a restart always serves what the database now holds. Only the
    // `cache:*` namespace; sessions and rate limits stay.
    redis.once('ready', () => void cacheService.invalidatePattern('cache:*'));
    // Unread notification counts invalidated while Redis was unreachable: dropped on every reconnect.
    dropUnreadCountsOnRedisReady();
    connectRedis();
    await connectDatabase();
    startDatabaseKeepAlive();
    // Missing dropdown / form-field defaults are inserted without overwriting admin customizations.
    await seedFormConfigsSafely();
    // The Product Catalog sheet, once (after the dropdowns its products use).
    await loadProductCatalogSheetSafely();
    // Built-in PDF templates (Classic / Modern / Compact); admin-created templates are never touched.
    await seedPdfTemplatesSafely();
    // Admin › Roles: a row for every role users hold (with the access its name gave before); saved roles untouched.
    await seedRolesSafely();
    // Bulk email checks a restart interrupted (Settings › Email Validation) carry on.
    resumeEmailValidationRuns();
    if (ENV.RUN_WORKERS) startWorkers();
    return app.listen(ENV.PORT, () => logger.info(`API listening on port ${ENV.PORT}`));
}

/** One start-up line on Admin › API Integrations readiness (the admin page shows the same). */
function logIntegrationsReadiness(): void {
    const { READY_REASON, PUBLIC_API_URL } = ENV.INTEGRATIONS;
    if (READY_REASON === 'key_missing') {
        logger.info('INTEGRATIONS_ENCRYPTION_KEY is not set: Admin › API Integrations can\'t store secrets yet');
    }
    if (ENV.INTEGRATIONS.FAKE_PROVIDER_IGNORED) {
        logger.warn('CALENDAR_FAKE_PROVIDER is ignored in production: the test calendar provider is off');
    } else if (ENV.INTEGRATIONS.FAKE_PROVIDER) {
        logger.warn('CALENDAR_FAKE_PROVIDER is on: the in-memory test calendar provider serves unclaimed company domains (development only)');
    }
    if (ENV.IS_PRODUCTION && PUBLIC_API_URL && !PUBLIC_API_URL.startsWith('https://')) {
        logger.warn('PUBLIC_API_URL is not https: calendar webhooks stay off (changes arrive by polling)');
    } else if (ENV.INTEGRATIONS.WEBHOOKS_ACTIVE) {
        logger.info('Calendar webhooks are on: channels are created for synced people (changes arrive within seconds)');
    }
}

function registerShutdown(server: Server): void {
    let shuttingDown = false;
    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'Shutting down');
        server.close(async () => {
            stopDatabaseKeepAlive();
            await stopWorkers();
            closeMail();
            await Promise.allSettled([closeQueues(), shutdownPdfRenderer(), prisma.$disconnect(), redis.quit()]);
            process.exit(0);
        });
        // Don't hang forever on keep-alive connections.
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start()
    .then(registerShutdown)
    .catch((err: Error) => {
        logger.fatal({ err: err.message }, 'Failed to start API (database unreachable?)');
        process.exit(1);
    });

export default app;
