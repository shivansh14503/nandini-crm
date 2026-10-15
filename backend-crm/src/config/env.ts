import 'dotenv/config';

export const ENV = {
    PORT: Number(process.env.PORT ?? 5000),
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    JWT_SECRET: process.env.JWT_SECRET || 'super_secret_crm_jwt_key',
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    DB: {
        USER: process.env.DB_USER,
        PASSWORD: process.env.DB_PASSWORD,
        SERVER: process.env.DB_SERVER || '127.0.0.1',
        DATABASE: process.env.DB_DATABASE || 'CRM_DB',
        PORT: parseInt(process.env.DB_PORT || '1433', 10),
    },
    COOKIE: {
        NAME: 'token',
        MAX_AGE_MS: 8 * 60 * 60 * 1000, // 8 hours
    },
};
