/**
 * The `.ics` file a visitor downloads after booking (RFC 5545, pure). No email is sent (the mail layer is parked), so
 * this is how the meeting reaches the visitor's own calendar. `METHOD:PUBLISH` (an entry, not an invitation): when
 * calendar sync sends the owner's real invitation later (P2-3b), the visitor's calendar keeps two entries only if they
 * imported this one; the UID differs from the provider's on purpose so neither overwrites the other.
 */

export interface IcsEvent {
    uid: string;
    start: Date;
    end: Date;
    summary: string;
    location?: string | null;
    description?: string | null;
    /** DTSTAMP (when the booking was made). */
    stamp: Date;
}

/** `20261130T043000Z`. */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (continuation lines start with a space), never inside a UTF-8 sequence. */
export function foldIcsLine(line: string): string {
    const out: string[] = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const size = Buffer.byteLength(ch, 'utf8');
        const limit = out.length === 0 ? 75 : 74;
        if (bytes + size > limit) {
            out.push(current);
            current = '';
            bytes = 0;
        }
        current += ch;
        bytes += size;
    }
    out.push(current);
    return out.join('\r\n ');
}

export function buildIcs(event: IcsEvent): string {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nandini CRM//Booking links//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${event.uid}`,
        `DTSTAMP:${utc(event.stamp)}`,
        `DTSTART:${utc(event.start)}`,
        `DTEND:${utc(event.end)}`,
        `SUMMARY:${escapeIcsText(event.summary)}`,
        ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
        ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
