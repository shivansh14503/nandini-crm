import { fmtInstant, fmtWallClock } from './formats';
import { isWallClock } from './zonedTime';

/**
 * Formats an ISO timestamp on the business clock in the company formats (utils/formats). Not customized: today's
 * 'dd-MMM-yyyy, hh:mm a' (e.g. '24-Oct-2026, 01:07 PM'). A zone-less `YYYY-MM-DDTHH:mm` business wall clock (e.g. a
 * contract's renewal reminder) is already business time and prints as stored on every device. Empty/invalid input → ''.
 */
export function formatDateTime(iso?: string | null): string {
    if (isWallClock(iso)) return fmtWallClock(iso, { legacyTime: 'hh:mm A' });
    return fmtInstant(iso, { legacyTime: 'hh:mm A' });
}
