'use client';

import { StatusChip } from '@/components/settings/integrations/integrationUi';
import type { CrmUser } from '@/types/user.types';
import { useBusinessToday, userAwayStatus } from '@/utils/userAvailability';

/**
 * A small warning chip, "Out of office until 5 Dec" or "On leave", for a user who is away today (business timezone);
 * renders nothing otherwise. The out-of-office message shows as its tooltip.
 */
export function UserAwayChip({ user }: { user: Pick<CrmUser, 'onLeave' | 'outOfOffice'> | null | undefined }) {
    const today = useBusinessToday();
    const status = userAwayStatus(user, today);
    if (!status) return null;
    return (
        <StatusChip tone="warning" title={status.title}>
            {status.label}
        </StatusChip>
    );
}
