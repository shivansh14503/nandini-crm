import { GRAPH_API } from '../../integrations/integration.constants.js';
import type { AdapterOptions } from './google.js';
import { providerFetch } from './http.js';
import type { CalendarProviderAdapter, CallCtx } from './types.js';

/**
 * Microsoft Graph for one employee's mailbox with the tenant-wide app token (addendum AC2): every call goes to
 * `/users/{mailbox}/…` (`/me` has no meaning app-only). The event operations join this adapter with the push engine
 * (P2-3b), which builds its URLs with `graphUserUrl(ctx.mailbox)`.
 */

export const graphUserUrl = (mailbox: string) => `${GRAPH_API}/users/${encodeURIComponent(mailbox)}`;

export function createMicrosoftAdapter(options: AdapterOptions = {}): CalendarProviderAdapter {
    const fetchImpl = options.fetchImpl;
    return {
        key: 'microsoft',

        async probeCalendar(ctx: CallCtx): Promise<void> {
            await providerFetch(
                { method: 'GET', url: `${graphUserUrl(ctx.mailbox)}/events?$top=1&$select=id`, headers: { Authorization: `Bearer ${ctx.accessToken}` }, provider: 'microsoft', operation: 'probe' },
                { fetchImpl, attempts: 2 },
            );
        },
    };
}
