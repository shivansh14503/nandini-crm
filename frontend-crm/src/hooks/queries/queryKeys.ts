import type { PaginationParams } from '@/types/api.types';

/** Hierarchical keys (`all` → `lists`/`details` → one list/record) so invalidation can target any level. */
function createEntityKeys<E extends string>(entity: E) {
    const all = [entity] as const;
    return {
        all,
        lists: () => [...all, 'list'] as const,
        list: (params?: PaginationParams) => [...all, 'list', params ?? {}] as const,
        details: () => [...all, 'detail'] as const,
        detail: (id: string) => [...all, 'detail', id] as const,
    };
}

export type EntityQueryKeys = ReturnType<typeof createEntityKeys<string>>;

export const queryKeys = {
    organizations: createEntityKeys('organizations'),
    contacts: createEntityKeys('contacts'),
    tickets: createEntityKeys('tickets'),
    contracts: createEntityKeys('contracts'),
    activities: {
        ...createEntityKeys('activities'),
        /** Calendar feed of a window (activities plus lead / opportunity follow-ups and contract renewals). */
        calendar: (params?: PaginationParams) => ['activities', 'calendar', params ?? {}] as const,
        /** Business timezone, durations and reminders (GET /api/activities/meta). */
        meta: () => ['activities', 'meta'] as const,
    },
    documents: createEntityKeys('documents'),
    leads: createEntityKeys('leads'),
    opportunities: createEntityKeys('opportunities'),
    quotations: createEntityKeys('quotations'),
    products: createEntityKeys('products'),
    partnerCompanies: createEntityKeys('partner-companies'),
    referrals: createEntityKeys('referrals'),
    pdfTemplates: {
        ...createEntityKeys('pdf-templates'),
        /** Field registry + line-item columns of a module (custom fields included). */
        fields: (module: string) => ['pdf-templates', 'fields', module] as const,
        /** Record (or sample) context the builder canvas renders with. */
        context: (module: string, recordId: string) => ['pdf-templates', 'context', module, recordId] as const,
        /** Saved sections / blocks library of a module. */
        saved: (module: string) => ['pdf-templates', 'saved', module] as const,
    },
    users: {
        all: ['users'] as const,
    },
    /** Admin › API Integrations (`/api/admin/integrations`); `notifyCrmUpdate('/api/admin/integrations')` refreshes it. */
    integrations: {
        all: ['integrations'] as const,
        admin: () => ['integrations', 'admin'] as const,
        people: () => ['integrations', 'people'] as const,
    },
    /** The signed-in user's own calendar connections (`/api/calendar-connections`); `notifyCrmUpdate` on that path refreshes them. */
    calendarConnections: {
        all: ['calendarConnections'] as const,
        own: () => ['calendarConnections', 'own'] as const,
    },
    /** The signed-in user's notifications (navbar bell); `notifyCrmUpdate('/api/notifications')` refreshes them. */
    notifications: {
        all: ['notifications'] as const,
        /** Pages of the bell list (an infinite query, newest first). */
        list: (params?: { unreadOnly?: boolean }) => ['notifications', 'list', params ?? {}] as const,
        /** The badge: polled every minute while the tab is visible. */
        unreadCount: () => ['notifications', 'unread-count'] as const,
    },
} as const;

export type QueryEntity = keyof typeof queryKeys;

/**
 * Maps a `notifyCrmUpdate` entity (services pass their endpoint, e.g. `/api/tickets`) to its query-key
 * namespace, or undefined when no queries are cached under it.
 */
export function queryEntityFromSync(entity?: string): QueryEntity | undefined {
    // Endpoints are kebab-case (`/api/partner-companies`); query namespaces are camelCase (`partnerCompanies`).
    const name = entity
        ?.split('/')
        .filter(Boolean)
        .pop()
        ?.toLowerCase()
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    return name && name in queryKeys ? (name as QueryEntity) : undefined;
}
