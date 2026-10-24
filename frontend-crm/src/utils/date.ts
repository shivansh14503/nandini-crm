const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Formats an ISO timestamp as 'dd-MMM-yyyy, hh:mm a' (e.g. '24-Oct-2026, 01:07 PM'). Empty/invalid input → ''. */
export function formatDateTime(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hours = d.getHours() % 12 || 12;
    const meridiem = d.getHours() < 12 ? 'AM' : 'PM';
    return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}, ${pad(hours)}:${pad(d.getMinutes())} ${meridiem}`;
}
