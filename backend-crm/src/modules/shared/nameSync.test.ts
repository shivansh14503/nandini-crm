import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { propagateContactName, propagateOrganizationName } from './nameSync.js';

const actor: AuthUser = { id: 1, username: 'palak', role: 'Admin' };

/** Records every `updateMany` call per model; each reports `count` rows. */
function fakeTx(count = 1) {
    const calls: { model: string; args: { where: Record<string, unknown>; data: Record<string, unknown> } }[] = [];
    const model = (name: string) => ({
        async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
            calls.push({ model: name, args });
            return { count };
        },
    });
    const tx = Object.fromEntries(['lead', 'contact', 'opportunity', 'quotation', 'ticket', 'contract', 'activity', 'activityAttendee', 'referral'].map((name) => [name, model(name)]));
    return { tx: tx as unknown as TransactionClient, calls };
}

describe('propagateOrganizationName: activities', () => {
    it('renames live activities linked to the organization or related to it, stamping the editor', async () => {
        const { tx, calls } = fakeTx();
        const counts = await propagateOrganizationName(tx, 'org1', 'ACME LTD', actor);
        const activity = calls.filter((call) => call.model === 'activity').map((call) => call.args);
        assert.deepEqual(activity, [
            { where: { organizationId: 'org1', isDeleted: false }, data: { organizationName: 'ACME LTD', updatedBy: 'palak' } },
            { where: { relatedModule: 'organizations', relatedId: 'org1', isDeleted: false }, data: { relatedTo: 'ACME LTD', updatedBy: 'palak' } },
        ]);
        assert.equal(counts.activities, 2);
    });

    it('renames the activities next to the other linked modules (referrals have a free-text Company Name instead)', async () => {
        const { tx } = fakeTx();
        assert.deepEqual(await propagateOrganizationName(tx, 'org1', 'ACME LTD', actor), {
            contacts: 1,
            opportunities: 1,
            quotations: 1,
            tickets: 1,
            contracts: 1,
            activities: 2,
        });
    });
});

describe('propagateContactName: activities', () => {
    it('renames the contact, the related label and contact attendees of live activities', async () => {
        const { tx, calls } = fakeTx();
        const counts = await propagateContactName(tx, 'c1', 'Asha Rao', actor);
        assert.deepEqual(
            calls.filter((call) => call.model === 'activity').map((call) => call.args),
            [
                { where: { contactId: 'c1', isDeleted: false }, data: { contact: 'Asha Rao', updatedBy: 'palak' } },
                { where: { relatedModule: 'contacts', relatedId: 'c1', isDeleted: false }, data: { relatedTo: 'Asha Rao', updatedBy: 'palak' } },
            ],
        );
        assert.deepEqual(
            calls.filter((call) => call.model === 'activityAttendee').map((call) => call.args),
            [{ where: { contactId: 'c1', activity: { isDeleted: false } }, data: { name: 'Asha Rao' } }],
        );
        assert.equal(counts.activities, 3);
    });

    it('leaves activities out of the counts when nothing changed', async () => {
        const { tx } = fakeTx(0);
        assert.deepEqual(await propagateContactName(tx, 'c1', 'Asha Rao', actor), {});
    });
});
