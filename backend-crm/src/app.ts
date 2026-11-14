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
import authRouter from './modules/auth/auth.routes.js';
import productRouter from './modules/products/product.routes.js';
import organizationRouter from './modules/organizations/organization.routes.js';
import contactRouter from './modules/contacts/contact.routes.js';
import leadRouter from './modules/leads/lead.routes.js';
import opportunityRouter from './modules/opportunities/opportunity.routes.js';
import quotationRouter from './modules/quotations/quotation.routes.js';
import ticketRouter from './modules/tickets/ticket.routes.js';
import partnerCompanyRouter from './modules/partner-companies/partnerCompany.routes.js';
import searchRouter from './modules/search/search.routes.js';
import lookupRouter from './modules/lookups/lookup.routes.js';
import auditRouter from './modules/audit/audit.routes.js';
import importRouter from './modules/imports/import.routes.js';
import formConfigRouter from './modules/form-configs/formConfig.routes.js';
import documentSeriesRouter from './modules/document-series/documentSeries.routes.js';
import tableFilterRouter from './modules/table-filters/tableFilter.routes.js';
import { seedFormConfigsSafely } from './modules/form-configs/formConfig.seed.js';
import { pdfAssetRouter, pdfSavedItemRouter, pdfTemplateRouter } from './modules/pdf/pdf.routes.js';
import { seedPdfTemplatesSafely } from './modules/pdf/pdfTemplate.seed.js';
import { shutdownPdfRenderer } from './modules/pdf/renderer/puppeteerRenderer.js';
import { closeQueues } from './jobs/queues.js';
import { startWorkers, stopWorkers } from './jobs/workers/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const LAN_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

const app: Express = express();

// Behind Azure App Service / a reverse proxy, trust one hop so req.ip (rate limiting, sessions) is the client's.
if (ENV.IS_PRODUCTION) app.set('trust proxy', 1);

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(helmet());
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (!ENV.IS_PRODUCTION || origin === ENV.CLIENT_ORIGIN || LAN_ORIGIN.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        // The frontend reads the server's PDF file name and rate-limit retry hints.
        exposedHeaders: ['Content-Disposition', 'Retry-After'],
    }),
);
app.use(
    pinoHttp({
        logger,
        // Health probes would otherwise flood the logs.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
);
app.use(cookieParser());
// Mounted before the global body parser: imports carry up to 5,000 rows and parse with their own 10 MB limit.
app.use('/api/import', importRouter);
// PDF template documents, saved library items and logo uploads (base64) parse with their own 2 MB limit.
app.use('/api/pdf-templates', pdfTemplateRouter);
app.use('/api/pdf-assets', pdfAssetRouter);
app.use('/api/pdf-saved-items', pdfSavedItemRouter);
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
app.use('/api/partner-companies', partnerCompanyRouter);
app.use('/api/search', searchRouter);
app.use('/api/lookups', lookupRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/form-configs', formConfigRouter);
app.use('/api/document-series', documentSeriesRouter);
app.use('/api/table-filters', tableFilterRouter);

// ── 404 + global error handler ─────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start: database must be reachable; Redis connects in the background ────────
async function start(): Promise<Server> {
    if (ENV.USING_DEV_JWT_SECRET) {
        logger.warn('JWT_SECRET is not set; using an insecure development secret');
    }
    connectRedis();
    await connectDatabase();
    startDatabaseKeepAlive();
    // Missing dropdown / form-field defaults are inserted without overwriting admin customizations.
    await seedFormConfigsSafely();
    // Built-in PDF templates (Classic / Modern / Compact); admin-created templates are never touched.
    await seedPdfTemplatesSafely();
    if (ENV.RUN_WORKERS) startWorkers();
    return app.listen(ENV.PORT, () => logger.info(`API listening on port ${ENV.PORT}`));
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
