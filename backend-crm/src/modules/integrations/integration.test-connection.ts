import { createGoogleAdapter } from '../calendar-sync/providers/google.js';
import { mintGoogleToken, type ServiceAccountKey } from '../calendar-sync/providers/googleServiceAccount.js';
import { createMicrosoftAdapter } from '../calendar-sync/providers/microsoft.js';
import { appTokenRoles, mintGraphToken, type GraphAppCredentials } from '../calendar-sync/providers/microsoftAppToken.js';
import type { FetchImpl } from '../calendar-sync/providers/types.js';
import { adminMessageOf, classifyApiError, TokenError } from '../calendar-sync/syncErrors.js';
import { GOOGLE_DWD_SCOPES, GOOGLE_KEY_CHECK_SCOPE, MICROSOFT_APP_PERMISSION, type IntegrationProviderKey } from './integration.constants.js';

/**
 * "Test connection" on Admin › API Integrations (addendum §4.3): two steps with the saved credentials.
 *   1. app  — Google: mint a token for the service account itself (no `sub`) for `calendar.events.owned`: proves the
 *             key, not the delegation. Microsoft: the client-credentials token; its `roles` claim is reported
 *             ("Entra grants: …").
 *   2. user — only with `asUsername`: mint as that person (Google: the two delegated scopes) and read one event from
 *             their own calendar (`probeCalendar`). Proves domain-wide delegation / the mailbox scope.
 * Nothing here is logged; messages are fixed sentences plus the provider's own words, ≤ 300 characters in all.
 */

export type TestStepName = 'app' | 'user';

export type TestCode =
    | 'key_ok'
    | 'credentials_ok'
    | 'delegation_ok'
    | 'mailbox_ok'
    | 'not_configured'
    | 'not_available'
    | 'no_email'
    /** The saved credentials changed while the test ran; the result was not stored. */
    | 'credentials_changed'
    | string;

export interface TestStep {
    step: TestStepName;
    ok: boolean;
    code: TestCode;
    message: string;
}

export interface TestResult {
    /** Every step that ran passed. */
    ok: boolean;
    /** The first failing step's code, else the last step's. */
    code: TestCode;
    message: string;
    steps: TestStep[];
}

export const TEST_MESSAGE_MAX = 300;

const clip = (text: string, max = TEST_MESSAGE_MAX) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The fixed sentence, then extra words in brackets, within 300 characters. */
export function testMessage(sentence: string, detail?: string): string {
    const extra = (detail ?? '').replace(/\s+/g, ' ').trim();
    if (!extra) return clip(sentence);
    const room = TEST_MESSAGE_MAX - sentence.length - 3;
    return room > 20 ? `${sentence} (${clip(extra, room)})` : clip(sentence);
}

/** Overall result of the steps that ran. Pure. */
export function combineSteps(steps: TestStep[]): TestResult {
    const failed = steps.find((s) => !s.ok);
    const lead = failed ?? steps[steps.length - 1];
    return { ok: !failed, code: lead.code, message: lead.message, steps };
}

const failedStep = (step: TestStepName, err: unknown, provider: 'google' | 'microsoft', probe: boolean): TestStep => {
    const failure = err instanceof TokenError ? classifyApiError(provider, err) : classifyApiError(provider, err, { probe });
    if (failure) return { step, ok: false, code: failure.code, message: adminMessageOf(failure) };
    return { step, ok: false, code: 'provider_error', message: testMessage('The provider answered with an unexpected error.', err instanceof Error ? err.message : '') };
};

export interface TestSubject {
    username: string;
    email: string | null;
}

/** Google: key check, then (optionally) impersonation + one read of the person's primary calendar. */
export async function testGoogle(key: ServiceAccountKey, subject: TestSubject | null, fetchImpl: FetchImpl, now: Date = new Date()): Promise<TestResult> {
    const steps: TestStep[] = [];
    try {
        await mintGoogleToken(key, null, [GOOGLE_KEY_CHECK_SCOPE], fetchImpl, now);
        steps.push({ step: 'app', ok: true, code: 'key_ok', message: 'Google accepted the service account key.' });
    } catch (err) {
        steps.push(failedStep('app', err, 'google', false));
        return combineSteps(steps);
    }
    if (subject) steps.push(await userStep('google', subject, async (email) => {
        const grant = await mintGoogleToken(key, email, GOOGLE_DWD_SCOPES, fetchImpl, now);
        await createGoogleAdapter({ fetchImpl }).probeCalendar({ accessToken: grant.accessToken, calendarId: 'primary', accountEmail: email, mailbox: email });
    }));
    return combineSteps(steps);
}

/** Microsoft: the app token (with the Entra grants it carries), then (optionally) one read of the person's mailbox. */
export async function testMicrosoft(creds: GraphAppCredentials, subject: TestSubject | null, fetchImpl: FetchImpl, now: Date = new Date()): Promise<TestResult> {
    const steps: TestStep[] = [];
    let accessToken: string;
    try {
        accessToken = (await mintGraphToken(creds, fetchImpl, now)).accessToken;
        const roles = appTokenRoles(accessToken);
        const grants = roles.length > 0 ? `Entra grants: ${roles.join(', ')}` : 'Entra grants: none (expected if you scoped the app with RBAC for Applications)';
        const missing = roles.length > 0 && !roles.includes(MICROSOFT_APP_PERMISSION) ? ` ${MICROSOFT_APP_PERMISSION} is not among them.` : '';
        steps.push({ step: 'app', ok: true, code: 'credentials_ok', message: testMessage(`Microsoft accepted the client ID, secret and tenant.${missing}`, grants) });
    } catch (err) {
        steps.push(failedStep('app', err, 'microsoft', false));
        return combineSteps(steps);
    }
    if (subject) steps.push(await userStep('microsoft', subject, async (email) => {
        await createMicrosoftAdapter({ fetchImpl }).probeCalendar({ accessToken, calendarId: '', accountEmail: email, mailbox: email });
    }));
    return combineSteps(steps);
}

async function userStep(provider: 'google' | 'microsoft', subject: TestSubject, run: (email: string) => Promise<void>): Promise<TestStep> {
    const email = subject.email?.trim().toLowerCase();
    if (!email) return { step: 'user', ok: false, code: 'no_email', message: `${subject.username} has no company email. Set one on the People tab first.` };
    try {
        await run(email);
        return provider === 'google'
            ? { step: 'user', ok: true, code: 'delegation_ok', message: clip(`Domain-wide delegation works: the CRM read ${email}'s calendar as them.`) }
            : { step: 'user', ok: true, code: 'mailbox_ok', message: clip(`The app can reach ${email}'s calendar.`) };
    } catch (err) {
        const step = failedStep('user', err, provider, true);
        if (provider === 'microsoft' && step.code === 'mailbox_out_of_scope') {
            step.message = testMessage(step.message.split(' (')[0], 'Run Test-ServicePrincipalAuthorization in Exchange Online PowerShell to see why.');
        }
        return step;
    }
}

/** A provider without a check yet (Zoom: Calendar Phase 3, P3-2). */
export function notAvailable(provider: IntegrationProviderKey): TestResult {
    const message = provider === 'zoom' ? 'The Zoom check arrives with video meetings (Phase 3). The credentials are stored.' : 'This provider has no check.';
    return { ok: false, code: 'not_available', message, steps: [{ step: 'app', ok: false, code: 'not_available', message }] };
}

/** Credentials missing or unreadable. */
export function notConfigured(message: string): TestResult {
    return { ok: false, code: 'not_configured', message, steps: [{ step: 'app', ok: false, code: 'not_configured', message }] };
}
