import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { LINK_FORBIDDEN_MESSAGE, linksFromTarget, relatedChanged, resolveActivityLinks, TARGET_MAPPERS, toLinkTarget } from './activity.links.js';
import { activityInputSchema } from './activity.validator.js';

const owned = { id: 'r1', assignedTo: 'palak', createdBy: 'palak', isDeleted: false };
const pick = (row: ReturnType<(typeof TARGET_MAPPERS)[keyof typeof TARGET_MAPPERS]>) => ({
    code: row.code,
    label: row.label,
    organization: [row.organizationId ?? null, row.organizationName],
    contact: [row.contactId ?? null, row.contact],
});
const linked = { organizationName: 'ACME', organizationId: 'o1', contact: 'Asha', contactId: 'c1' };

describe('TARGET_MAPPERS', () => {
    it('maps each related module to code, label, organization and contact', () => {
        assert.deepEqual(pick(TARGET_MAPPERS.leads({ ...owned, leadCode: 'LD-0001', name: 'Ravi', organizationName: 'ACME' })), {
            code: 'LD-0001',
            label: 'Ravi',
            organization: [null, 'ACME'],
            contact: [null, ''],
        });
        assert.deepEqual(
            pick(TARGET_MAPPERS.opportunities({ ...owned, ...linked, opportunityCode: 'OPP-0001', opportunityName: null, productCategoryJson: '["CRM","ERP"]' })),
            { code: 'OPP-0001', label: 'CRM, ERP', organization: ['o1', 'ACME'], contact: ['c1', 'Asha'] },
        );
        assert.deepEqual(pick(TARGET_MAPPERS.contacts({ ...owned, id: 'c7', contactCode: 'CON-0007', name: 'Meera', organizationName: 'ACME', organizationId: 'o1' })), {
            code: 'CON-0007',
            label: 'Meera',
            organization: ['o1', 'ACME'],
            contact: ['c7', 'Meera'],
        });
        assert.deepEqual(pick(TARGET_MAPPERS.organizations({ ...owned, id: 'o9', assignedTo: null, accountCode: 'ORG-0009', organizationName: 'GLOBEX' })), {
            code: 'ORG-0009',
            label: 'GLOBEX',
            organization: ['o9', 'GLOBEX'],
            contact: [null, ''],
        });
        assert.equal(TARGET_MAPPERS.organizations({ ...owned, assignedTo: null, accountCode: 'ORG-1', organizationName: 'X' }).assignedTo, '');
        assert.deepEqual(pick(TARGET_MAPPERS.quotations({ ...owned, ...linked, quotationCode: 'QT-0001', quotationTitle: 'Annual licence' })), {
            code: 'QT-0001',
            label: 'Annual licence',
            organization: ['o1', 'ACME'],
            contact: ['c1', 'Asha'],
        });
        assert.equal(TARGET_MAPPERS.tickets({ ...owned, ...linked, ticketNumber: 'TKT-1', ticketSubject: null }).label, 'ACME');
        assert.equal(TARGET_MAPPERS.tickets({ ...owned, ...linked, ticketNumber: 'TKT-1', ticketSubject: 'Login fails' }).label, 'Login fails');
        assert.equal(TARGET_MAPPERS.contracts({ ...owned, ...linked, contractNumber: 'CTR-1', contractTitle: '' }).label, 'ACME');
        assert.equal(TARGET_MAPPERS.contracts({ ...owned, ...linked, contractNumber: 'CTR-1', contractTitle: 'AMC' }).module, 'contracts');
    });

    it('drops the check-only fields for the picker', () => {
        const target = toLinkTarget(TARGET_MAPPERS.leads({ ...owned, leadCode: 'LD-1', name: 'Ravi', organizationName: null }));
        assert.ok(!('isDeleted' in target) && !('createdBy' in target));
        assert.equal(target.organizationName, '');
        assert.ok(!('organizationId' in target && target.organizationId !== undefined));
    });
});

describe('linksFromTarget / relatedChanged', () => {
    const target = toLinkTarget(TARGET_MAPPERS.quotations({ ...owned, ...linked, quotationCode: 'QT-1', quotationTitle: 'Q' }));

    it('fills organization and contact from a picked record', () => {
        assert.deepEqual(linksFromTarget({}, target), { organization: { id: 'o1', name: 'ACME' }, contact: { id: 'c1', name: 'Asha' } });
        assert.deepEqual(linksFromTarget({}, null), { organization: null, contact: null });
    });

    it('lets explicit ids win', () => {
        assert.deepEqual(linksFromTarget({ organizationId: 'o2', contactId: 'c2' }, target), { organization: null, contact: null });
        assert.deepEqual(linksFromTarget({ contactId: 'c2' }, target).organization, { id: 'o1', name: 'ACME' });
    });

    it('tells a newly picked record from the stored one', () => {
        const stored = { relatedModule: 'leads', relatedId: 'l1' };
        assert.equal(relatedChanged({ relatedModule: 'leads', relatedId: 'l1' }, stored), false);
        assert.equal(relatedChanged({ relatedModule: 'leads', relatedId: 'l2' }, stored), true);
        assert.equal(relatedChanged({}, stored), true);
        assert.equal(relatedChanged({ relatedModule: 'leads', relatedId: 'l1' }, undefined), true);
        assert.equal(relatedChanged({}, undefined), false);
    });
});

describe('resolveActivityLinks', () => {
    const lead = { id: 'l1', leadCode: 'LD-0001', name: 'Ravi', organizationName: 'ACME', assignedTo: 'ravi', createdBy: 'ravi', isDeleted: false };
    const tx = {
        lead: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === lead.id ? lead : null) },
        organization: {
            findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'o2' ? { id: 'o2', organizationName: 'GLOBEX', isDeleted: false } : null),
            findFirst: async ({ where }: { where: { organizationName: string } }) => (where.organizationName === 'ACME' ? { id: 'o1', organizationName: 'ACME' } : null),
        },
        contact: { findFirst: async () => null, findUnique: async () => null },
    } as unknown as TransactionClient;
    const input = (body: Record<string, unknown>) =>
        activityInputSchema.parse({ followupType: 'Call', subject: 'Call back', assignedTo: 'palak', startAt: '2026-11-26T10:00:00+05:30', ...body });
    const exec: AuthUser = { id: 1, username: 'palak', role: 'Sales Executive' };
    const owner: AuthUser = { id: 2, username: 'ravi', role: 'Sales Executive' };

    it('stores the code and label of a picked record and links its organization by name', async () => {
        const links = await resolveActivityLinks(tx, input({ relatedModule: 'leads', relatedId: 'l1', relatedTo: 'typed' }), undefined, owner);
        assert.deepEqual(links, {
            relatedModule: 'leads',
            relatedId: 'l1',
            relatedTo: 'Ravi',
            relatedCode: 'LD-0001',
            organization: { id: 'o1', name: 'ACME' },
            contact: { id: null, name: '' },
        });
    });

    it("refuses linking a record the user can't access, unless it is unchanged", async () => {
        await assert.rejects(
            resolveActivityLinks(tx, input({ relatedModule: 'leads', relatedId: 'l1' }), undefined, exec),
            (err: unknown) => err instanceof HttpError && err.statusCode === 403 && err.message === LINK_FORBIDDEN_MESSAGE,
        );
        const previous = { relatedModule: 'leads', relatedId: 'l1', relatedTo: 'Ravi', relatedCode: 'LD-0001', organizationId: null, contactId: null };
        const links = await resolveActivityLinks(tx, input({ relatedModule: 'leads', relatedId: 'l1', organizationName: 'Typed Org' }), previous, exec);
        assert.equal(links.relatedCode, 'LD-0001');
        // An unchanged record doesn't refill the organization: the typed name stays.
        assert.deepEqual(links.organization, { id: null, name: 'TYPED ORG' });
    });

    it('validates explicit ids and lets them win over the picked record', async () => {
        const links = await resolveActivityLinks(tx, input({ relatedModule: 'leads', relatedId: 'l1', organizationId: 'o2' }), undefined, owner);
        assert.deepEqual(links.organization, { id: 'o2', name: 'GLOBEX' });
        await assert.rejects(resolveActivityLinks(tx, input({ organizationId: 'missing' }), undefined, owner), (err: unknown) => err instanceof HttpError && err.statusCode === 400);
        await assert.rejects(resolveActivityLinks(tx, input({ relatedModule: 'leads', relatedId: 'zz' }), undefined, owner), (err: unknown) => err instanceof HttpError && err.statusCode === 400);
    });
});
