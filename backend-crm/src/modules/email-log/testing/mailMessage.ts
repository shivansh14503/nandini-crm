import type { MailMessage } from '../providers/types.js';

/** A customer email as a provider adapter would hand it over (tests). */
export function message(over: Partial<MailMessage> = {}): MailMessage {
    return {
        providerMessageId: 'm1',
        providerThreadId: 't1',
        internetMessageId: '<abc@mail.example.com>',
        subject: 'Quotation',
        from: { email: 'ravi@customer.in', name: 'Ravi' },
        to: [{ email: 'asha@nandiniinfosys.com' }],
        cc: [],
        sentAt: new Date('2026-12-01T05:00:00Z'),
        snippet: 'Please send the revised quote',
        hasAttachments: false,
        sentByMailbox: false,
        isDraft: false,
        excluded: false,
        privateMarked: false,
        automated: false,
        webLink: null,
        ...over,
    };
}
