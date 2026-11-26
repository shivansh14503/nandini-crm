'use client';

import { StatusChip } from '@/components/settings/integrations/integrationUi';
import type { CrmUser } from '@/types/user.types';
import { useBusinessToday, userAwayStatus } from '@/utils/userAvailability';

type AwayUser = Pick<CrmUser, 'onLeave' | 'outOfOffice'>;

/**
 * A small warning chip, "Out of office until 5 Dec" or "On leave", for a user who is away today (business timezone);
 * renders nothing otherwise. The out-of-office message shows as its tooltip. Users with neither set skip the business
 * clock entirely, so long option lists (pickers, autocompletes) mount it on every row cheaply.
 */
export function UserAwayChip({ user }: { user: AwayUser | null | undefined }) {
    if (!user || (!user.onLeave && !user.outOfOffice)) return null;
    return <AwayChip user={user} />;
}

function AwayChip({ user }: { user: AwayUser }) {
    const today = useBusinessToday();
    const status = userAwayStatus(user, today);
    if (!status) return null;
    return (
        <StatusChip tone="warning" title={status.title}>
            {status.label}
        </StatusChip>
    );
}
