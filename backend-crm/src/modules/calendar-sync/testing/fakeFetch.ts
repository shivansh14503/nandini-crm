import jwt from 'jsonwebtoken';
import type { FetchImpl } from '../providers/types.js';

/**
 * A `fetch` replaying provider answers for tests (no network). Each route answers by URL prefix (and method); every
 * call is recorded with its parsed form / JSON body and headers. The answers are hand-written from the providers'
 * documented shapes, not recorded traffic.
 */

export interface RecordedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    form: Record<string, string> | null;
    json: unknown;
}

export type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
export type Route = { match: (url: string, method: string) => boolean; answer: (call: RecordedCall) => Answer | Promise<Answer> };

export function fakeFetch(routes: Route[]): { fetchImpl: FetchImpl; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const fetchImpl: FetchImpl = async (input, init = {}) => {
        const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
        const raw = typeof init.body === 'string' ? init.body : '';
        let form: Record<string, string> | null = null;
        let json: unknown = null;
        if (headers['content-type']?.includes('x-www-form-urlencoded')) form = Object.fromEntries(new URLSearchParams(raw));
        else if (raw) json = JSON.parse(raw);
        const call: RecordedCall = { url: String(input), method: init.method ?? 'GET', headers, form, json };
        calls.push(call);
        const route = routes.find((r) => r.match(call.url, call.method));
        if (!route) throw new Error(`fakeFetch: no route for ${call.method} ${call.url}`);
        const answer = await route.answer(call);
        if (answer instanceof Error) throw answer;
        const text = answer.body === undefined ? '' : typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
        return new Response(answer.status === 204 ? null : text, { status: answer.status, headers: { 'content-type': 'application/json', ...(answer.headers ?? {}) } });
    };
    return { fetchImpl, calls };
}

export const route = (prefix: string, answer: Route['answer'], method?: string): Route => ({
    match: (url, m) => url.startsWith(prefix) && (!method || m === method),
    answer,
});

/** An unsigned-in-spirit id_token (signed with a throwaway key: the connect flow only decodes it, see idToken.ts). */
export function idToken(claims: Record<string, unknown>): string {
    return jwt.sign(claims, 'test-only-key', { algorithm: 'HS256', noTimestamp: true });
}
