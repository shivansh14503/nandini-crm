'use client';

import React from 'react';
import { leadService, type LeadEmailMatch, type LeadMobileMatch } from '@/services/lead.service';
import type { CorporateEmail } from '@/types/organization.types';

export interface UseLeadExistingCheckOptions {
    mobile?: string;
    emailAddresses?: CorporateEmail[];
    /** The lead being edited, so its own mobile / emails aren't reported. */
    leadId?: string;
    /** Off in view mode: no API calls. */
    enabled?: boolean;
}

export interface LeadExistingCheck {
    mobileMatch: LeadMobileMatch | null;
    /** Keyed by lowercased email. */
    emailMatches: Record<string, LeadEmailMatch>;
}

const CHECK_DEBOUNCE_MS = 350;
const MIN_MOBILE_DIGITS = 7;
const NO_EMAIL_MATCHES: Record<string, LeadEmailMatch> = {};

/**
 * Debounced, informational lookup of whether the lead form's mobile number / emails already exist in the CRM.
 * Purely a heads-up: it never sets form errors or blocks a save.
 */
export function useLeadExistingCheck({ mobile, emailAddresses, leadId, enabled = true }: UseLeadExistingCheckOptions): LeadExistingCheck {
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
    const key = `${leadId ?? ''}\u0000${checkMobile}\u0000${emailsKey}`;

    const [result, setResult] = React.useState<{ key: string } & LeadExistingCheck>({ key: '', mobileMatch: null, emailMatches: NO_EMAIL_MATCHES });

    React.useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await leadService.checkDuplicates(
                    { mobile: checkMobile || undefined, emails: emailsKey ? emailsKey.split(',') : undefined, excludeId: leadId },
                    controller.signal
                );
                if (!controller.signal.aborted) {
                    setResult({ key, mobileMatch: res.mobileMatch, emailMatches: res.emailMatches ?? NO_EMAIL_MATCHES });
                }
            } catch {
                // Offline / timeout: it's only a heads-up, so just show nothing.
                if (!controller.signal.aborted) setResult({ key, mobileMatch: null, emailMatches: NO_EMAIL_MATCHES });
            }
        }, CHECK_DEBOUNCE_MS);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [active, key, checkMobile, emailsKey, leadId]);

    // Only report results for the current values (stale answers vanish as soon as the user edits).
    if (!active || result.key !== key) return { mobileMatch: null, emailMatches: NO_EMAIL_MATCHES };
    return { mobileMatch: result.mobileMatch?.exists ? result.mobileMatch : null, emailMatches: result.emailMatches };
}
