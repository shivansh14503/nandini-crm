import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ENV } from './config/env.js';
import { poolPromise } from './config/database.js';
import authRouter from './routes/auth.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app: Express = express();

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (
                !ENV.IS_PRODUCTION ||
                origin === ENV.CLIENT_ORIGIN ||
                /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
            ) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
    }),
);
app.use(express.json());
app.use(cookieParser());

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        message: 'CRM API is running',
    });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Global error handler ───────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start: wait for DB before accepting requests ───────────────────────────────
poolPromise
    .then(() => {
        app.listen(ENV.PORT, () => {
            console.log(`✅ API listening on port ${ENV.PORT}`);
        });
    })
    .catch((err: Error) => {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1);
    });

export default app;
