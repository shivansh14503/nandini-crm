export const ENV = {
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
    USE_MOCK: process.env.NEXT_PUBLIC_USE_MOCK !== 'false',
} as const;
