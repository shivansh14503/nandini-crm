'use client';

import React from 'react';
import { leadService, type DuplicateCheckOwner, type ExistingRecordMatch } from '@/services/lead.service';
import type { CorporateEmail } from '@/types/organization.types';

export interface UseExistingRecordCheckOptions {
    mobile?: string;
    emailAddresses?: CorporateEmail[];
    /** The record being edited, so its own mobile / emails aren't reported. */
    excludeId?: string;
    /** Which kind of record `excludeId` is. */
    owner: DuplicateCheckOwner;
    /** Off in view mode: no API calls. */
    enabled?: boolean;
}

export interface ExistingRecordCheck {
    mobileMatches: ExistingRecordMatch[];
    /** Keyed by lowercased email. */
    emailMatches: Record<string, ExistingRecordMatch[]>;
}

const CHECK_DEBOUNCE_MS = 350;
const MIN_MOBILE_DIGITS = 7;
const NO_MOBILE_MATCHES: ExistingRecordMatch[] = [];
const NO_EMAIL_MATCHES: Record<string, ExistingRecordMatch[]> = {};
const EMPTY: ExistingRecordCheck = { mobileMatches: NO_MOBILE_MATCHES, emailMatches: NO_EMAIL_MATCHES };

/**
 * Debounced lookup of the leads / contacts / organizations that already use the form's mobile number or emails,
 * so the form can list them as links (see `ExistingRecordMatches`). It never sets form errors or blocks a save.
 */
export function useExistingRecordCheck({
    mobile,
    emailAddresses,
    excludeId,
    owner,
    enabled = true,
}: UseExistingRecordCheckOptions): ExistingRecordCheck {
    const trimmedMobile = (mobile ?? '').trim();
    const checkMobile = trimmedMobile.replace(/\D/g, '').length >= MIN_MOBILE_DIGITS ? trimmedMobile : '';
    const emailsKey = React.useMemo(
        () =>
            [...new Set((emailAddresses ?? []).map((e) => (e?.email ?? '').trim().toLowerCase()).filter((e) => e.includes('@')))]
                .sort()
                .join(','),
        [emailAddresses]
    );
    const active = enabled && Boolean(checkMobile || emailsKey);
    const key = `${owner}\u0000${excludeId ?? ''}\u0000${checkMobile}\u0000${emailsKey}`;

    const [result, setResult] = React.useState<{ key: string } & ExistingRecordCheck>({ key: '', ...EMPTY });

    React.useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await leadService.checkDuplicates(
                    {
                        mobile: checkMobile || undefined,
                        emails: emailsKey ? emailsKey.split(',') : undefined,
                        excludeId,
                        excludeType: owner,
                    },
                    controller.signal
                );
                if (!controller.signal.aborted) {
                    setResult({
                        key,
                        mobileMatches: res.mobileMatches ?? NO_MOBILE_MATCHES,
                        emailMatches: res.emailMatches ?? NO_EMAIL_MATCHES,
                    });
                }
            } catch {
                // Offline / timeout: it's only a heads-up, so just show nothing.
                if (!controller.signal.aborted) setResult({ key, ...EMPTY });
            }
        }, CHECK_DEBOUNCE_MS);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [active, key, checkMobile, emailsKey, excludeId, owner]);

    // Only report results for the current values (stale answers vanish as soon as the user edits).
    if (!active || result.key !== key) return EMPTY;
    return { mobileMatches: result.mobileMatches, emailMatches: result.emailMatches };
}
