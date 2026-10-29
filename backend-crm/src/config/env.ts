import 'dotenv/config';

export const ENV = {
    PORT: Number(process.env.PORT ?? 8008),
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    JWT_SECRET: process.env.JWT_SECRET || 'super_secret_crm_jwt_key',
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:8007',
    DB: {
        USER: process.env.DB_USER,
        PASSWORD: process.env.DB_PASSWORD,
        SERVER: process.env.DB_SERVER || '127.0.0.1',
        DATABASE: process.env.DB_DATABASE || 'CRM_DB',
        PORT: parseInt(process.env.DB_PORT || '1433', 10),
        ENCRYPT: process.env.DB_ENCRYPT === 'true',
        TRUST_SERVER_CERT: process.env.DB_TRUST_SERVER_CERT
            ? process.env.DB_TRUST_SERVER_CERT === 'true'
            : process.env.DB_ENCRYPT !== 'true',
    },
    COOKIE: {
        NAME: 'token',
        MAX_AGE_MS: 8 * 60 * 60 * 1000, // 8 hours
    },
};
