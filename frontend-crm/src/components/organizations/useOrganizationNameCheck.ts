'use client';

import React from 'react';
import { organizationService, type OrganizationUniqueCheck, type SimilarOrganizationMatch } from '@/services/organization.service';
import { useOrganizations } from '@/hooks/queries/useOrganizations';
import {
    compareOrganizationNames,
    duplicateOrganizationMessage,
    findSimilarOrganizations,
    isDuplicateMatchKind,
    type OrgNameMatchKind,
} from '@/utils/organizationName';
import type { ExtendedOrganization } from '@/types/organization.types';

/** The fields a suggestion row shows; built from cached organizations or from the server's matches. */
export interface OrganizationSuggestionRecord {
    id: string;
    accountCode: string;
    organizationName: string;
    tradeName?: string | null;
    billingCity?: string | null;
    billingState?: string | null;
    accountStatus?: string | null;
    gstNo?: string | null;
}

export interface OrganizationNameSuggestion {
    record: OrganizationSuggestionRecord;
    matchKind: OrgNameMatchKind;
    score: number;
    reason?: string;
}

/** An existing organization with the same legal name (exact or canonically equal). */
export interface OrganizationNameDuplicate {
    matchKind: 'exact' | 'canonical';
    record: OrganizationSuggestionRecord;
    message: string;
}

export interface UseOrganizationNameCheckOptions {
    name: string;
    /** The record being edited, so its own name is neither suggested nor flagged. */
    organizationId?: string;
    /** Off in view mode / closed drawers: no cache load, no API calls. */
    enabled?: boolean;
}

export interface OrganizationNameCheck {
    suggestions: OrganizationNameSuggestion[];
    duplicate: OrganizationNameDuplicate | null;
    /** A server check for the current name is pending. */
    checking: boolean;
    /** The server has answered for the current name. */
    checked: boolean;
    /** Skips the remaining debounce (e.g. on blur). */
    checkNow: () => void;
}

const MIN_SUGGEST_LENGTH = 2;
const SUGGESTION_LIMIT = 6;
const CHECK_DEBOUNCE_MS = 350;
const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

const fromOrganization = (o: ExtendedOrganization): OrganizationSuggestionRecord => ({
    id: o.id,
    accountCode: o.accountCode,
    organizationName: o.organizationName,
    tradeName: o.tradeName || null,
    billingCity: o.billingCity || null,
    billingState: o.billingState || null,
    accountStatus: o.accountStatus || null,
    gstNo: o.gstNo || o.gstNumber || null,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fromServerMatch = ({ matchKind, ...record }: SimilarOrganizationMatch): OrganizationSuggestionRecord => record;

/**
 * Live duplicate detection + suggestions for an organization name. The cached organization list gives instant
 * feedback while typing; the debounced `check-unique` call is the authority (it sees every live record) and
 * replaces the cache's verdict once it answers for the current text.
 */
export function useOrganizationNameCheck({ name, organizationId, enabled = true }: UseOrganizationNameCheckOptions): OrganizationNameCheck {
    const { data: known = NO_ORGANIZATIONS } = useOrganizations(undefined, { enabled });
    const trimmed = (name ?? '').trim();
    const active = enabled && trimmed.length > 0;

    // The last settled check: `result` is absent when the request failed (offline / timeout).
    const [server, setServer] = React.useState<{ key: string; result?: OrganizationUniqueCheck } | null>(null);
    const [checkNowTick, setCheckNowTick] = React.useState(0);
    const checkNowRef = React.useRef(false);
    const key = `${organizationId ?? ''}\u0000${trimmed}`;

    React.useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        const delay = checkNowRef.current ? 0 : CHECK_DEBOUNCE_MS;
        checkNowRef.current = false;
        const timer = setTimeout(async () => {
            try {
                const result = await organizationService.checkUnique({ organizationName: trimmed, excludeId: organizationId }, controller.signal);
                if (!controller.signal.aborted) setServer({ key, result });
            } catch {
                // Offline / timeout: keep the cache's verdict; the server re-checks on save.
                if (!controller.signal.aborted) setServer({ key });
            }
        }, delay);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [key, trimmed, organizationId, active, checkNowTick]);

    const settled = active && server?.key === key;
    const serverResult = settled ? server?.result : undefined;

    const local = React.useMemo(
        () =>
            active && trimmed.length >= MIN_SUGGEST_LENGTH
                ? findSimilarOrganizations(known, trimmed, { excludeId: organizationId, limit: SUGGESTION_LIMIT })
                : [],
        [active, trimmed, known, organizationId]
    );

    const suggestions = React.useMemo<OrganizationNameSuggestion[]>(() => {
        if (!active || trimmed.length < MIN_SUGGEST_LENGTH) return [];
        const serverIds = new Set((serverResult?.suggestions ?? []).map((s) => s.id));
        const byId = new Map<string, OrganizationNameSuggestion>();
        for (const m of local) {
            // Once the server has answered, a cached "same organization" it doesn't confirm is stale (deleted / renamed).
            if (serverResult && isDuplicateMatchKind(m.matchKind) && !serverIds.has(m.record.id)) continue;
            byId.set(m.record.id, { record: fromOrganization(m.record), matchKind: m.matchKind, score: m.score, reason: m.reason });
        }
        for (const match of serverResult?.suggestions ?? []) {
            if (byId.has(match.id)) continue;
            const { score, reason } = compareOrganizationNames(trimmed, match.organizationName);
            byId.set(match.id, { record: fromServerMatch(match), matchKind: match.matchKind, score: score || 0.75, reason });
        }
        return [...byId.values()]
            .sort((a, b) => b.score - a.score || a.record.organizationName.localeCompare(b.record.organizationName))
            .slice(0, SUGGESTION_LIMIT);
    }, [active, trimmed, local, serverResult]);

    const duplicate = React.useMemo<OrganizationNameDuplicate | null>(() => {
        if (!active) return null;
        if (serverResult) {
            if (!serverResult.exists || serverResult.field !== 'organizationName' || !serverResult.accountCode || !serverResult.organizationName) {
                return null;
            }
            const matchKind = serverResult.matchKind === 'canonical' ? 'canonical' : 'exact';
            const record = suggestions.find((s) => s.record.id === serverResult.id)?.record ?? {
                id: serverResult.id ?? '',
                accountCode: serverResult.accountCode,
                organizationName: serverResult.organizationName,
            };
            return {
                matchKind,
                record,
                message: serverResult.message || duplicateOrganizationMessage(matchKind, record.organizationName, record.accountCode),
            };
        }
        const top = local[0];
        if (!top || !isDuplicateMatchKind(top.matchKind)) return null;
        return {
            matchKind: top.matchKind,
            record: fromOrganization(top.record),
            message: duplicateOrganizationMessage(top.matchKind, top.record.organizationName, top.record.accountCode),
        };
    }, [active, serverResult, suggestions, local]);

    const isChecking = active && !settled;
    const checkNow = React.useCallback(() => {
        if (!isChecking) return;
        checkNowRef.current = true;
        setCheckNowTick((n) => n + 1);
    }, [isChecking]);

    return { suggestions, duplicate, checking: isChecking, checked: Boolean(serverResult), checkNow };
}
