import { generateKeyPairSync, type KeyObject } from 'node:crypto';

/**
 * A service account key file for tests, with an RSA key generated locally (once per process). Nothing here is a real
 * Google key; the public half lets tests verify the RS256 signature of the assertions the CRM builds.
 */

let pair: { privatePem: string; publicKey: KeyObject } | null = null;

export function testKeyPair(): { privatePem: string; publicKey: KeyObject } {
    if (!pair) {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        pair = { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey };
    }
    return pair;
}

export const TEST_CLIENT_EMAIL = 'crm-calendar@nandini-crm.iam.gserviceaccount.com';
export const TEST_CLIENT_ID = '112233445566778899001';
export const TEST_PRIVATE_KEY_ID = '0123456789abcdef0123456789abcdef01234567';

/** The JSON text of a key file (`over` replaces or, with undefined, removes fields). */
export function serviceAccountKeyJson(over: Record<string, unknown> = {}): string {
    const file: Record<string, unknown> = {
        type: 'service_account',
        project_id: 'nandini-crm',
        private_key_id: TEST_PRIVATE_KEY_ID,
        private_key: testKeyPair().privatePem,
        client_email: TEST_CLIENT_EMAIL,
        client_id: TEST_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://evil.example/token',
        ...over,
    };
    for (const [k, v] of Object.entries(over)) if (v === undefined) delete file[k];
    return JSON.stringify(file);
}
