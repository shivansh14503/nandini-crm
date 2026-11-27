import { createFakeMailAdapter } from './fakeMail.js';
import { createGmailAdapter } from './gmail.js';
import { createGraphMailAdapter } from './graphMail.js';
import type { MailAdapter, MailProviderKey } from './types.js';

/** The one way email logging reaches a mail provider; tests swap any provider (`setMailAdapterForTests`). */

const defaults: Record<MailProviderKey, () => MailAdapter> = {
    google: () => createGmailAdapter(),
    microsoft: () => createGraphMailAdapter(),
    fake: () => createFakeMailAdapter(),
};
const cache = new Map<MailProviderKey, MailAdapter>();
const overrides = new Map<MailProviderKey, MailAdapter>();

export function getMailAdapter(key: MailProviderKey): MailAdapter {
    const override = overrides.get(key);
    if (override) return override;
    let adapter = cache.get(key);
    if (!adapter) {
        adapter = defaults[key]();
        cache.set(key, adapter);
    }
    return adapter;
}

export function setMailAdapterForTests(key: MailProviderKey, adapter: MailAdapter | null): void {
    if (adapter) overrides.set(key, adapter);
    else overrides.delete(key);
}

export const isMailProvider = (value: unknown): value is MailProviderKey => value === 'google' || value === 'microsoft' || value === 'fake';
