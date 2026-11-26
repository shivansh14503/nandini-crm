import { prisma } from '../../config/prisma.js';
import { runAsRevertOf } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { activityService } from '../activities/activity.service.js';
import { companyFormatsService } from '../company-formats/companyFormats.service.js';
import { contactService } from '../contacts/contact.service.js';
import { contractService } from '../contracts/contract.service.js';
import { referralService } from '../referrals/referral.service.js';
import { leadService } from '../leads/lead.service.js';
import { opportunityService } from '../opportunities/opportunity.service.js';
import { organizationService } from '../organizations/organization.service.js';
import { partnerCompanyService } from '../partner-companies/partnerCompany.service.js';
import { productService } from '../products/product.service.js';
import { quotationService } from '../quotations/quotation.service.js';
import { ticketService } from '../tickets/ticket.service.js';
import { parseChanges } from './audit.format.js';
import { auditIdParamSchema, auditUndoBodySchema } from './auditAdmin.query.js';
import { buildLabeler } from './auditAdmin.service.js';
import { buildUndoPatch, fieldValue, planUndo, sameValue, UNDOABLE_ACTIONS, undoBlockFor, type UndoFieldPlan } from './auditUndo.js';

/**
 * Undo and Restore from Admin › Audit Log. Both go through the module's own service, so the record's normal rules
 * apply (validation, uniqueness, status transitions, name write-through, caches):
 *  • Restore brings back a soft-deleted record from its DELETE entry (`service.restore`, which writes RESTORE).
 *  • Undo puts the `from` values of an UPDATE / STATUS_CHANGE back with `service.update`, run as the undo of the
 *    entry (`runAsRevertOf`) so the update entry it writes is a REVERT pointing at it. Fields changed again since
 *    are left alone and listed. An entry is undone (or restored from) once: a REVERT / RESTORE pointing at it ends it.
 */

interface RecordService {
    getById(id: string, user: AuthUser): Promise<object>;
    update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<object>;
    restore(id: string, user: AuthUser, revertsId?: string): Promise<void>;
}

const RECORD_SERVICES: Readonly<Record<string, RecordService>> = {
    Lead: leadService,
    Contact: contactService,
    Organization: organizationService,
    Opportunity: opportunityService,
    Quotation: quotationService,
    Product: productService,
    Ticket: ticketService,
    Contract: contractService,
    Activity: activityService,
    PartnerCompany: partnerCompanyService,
    Referral: referralService,
};

async function loadEntry(params: unknown) {
    const { id } = auditIdParamSchema.parse(params);
    const row = await prisma.auditLog.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw HttpError.notFound('Audit entry not found');
    return row;
}

/** The first entry that undid or restored `id` (null when none has). */
export function findReversal(id: bigint) {
    return prisma.auditLog.findFirst({ where: { revertsId: id }, orderBy: { id: 'asc' }, select: { id: true, action: true, changedBy: true, createdAt: true } });
}

async function assertNotReversed(id: bigint, message: string) {
    const reversal = await findReversal(id);
    if (reversal) throw new HttpError(`${message} (entry #${reversal.id}).`, 409, { code: 'ALREADY_REVERSED' });
}

/** The entry, its record's service and the record now; throws when the entry can't be undone. */
async function undoContext(params: unknown, user: AuthUser) {
    const row = await loadEntry(params);
    const service = RECORD_SERVICES[row.entityType];
    if (!service || !UNDOABLE_ACTIONS.has(row.action)) {
        throw new HttpError('Only a field change or status change of a CRM record can be undone.', 409, { code: 'NOT_UNDOABLE' });
    }
    await assertNotReversed(row.id, 'This change was already undone');
    // A deleted record isn't found by getById (404): restore it first.
    const record = (await service.getById(row.entityId, user)) as Record<string, unknown>;
    const changes = parseChanges(row.changesJson);
    // Calendar-made record changes and a follow-up activity's locked fields can't be put back (auditUndo.ts).
    return { row, service, record, plans: planUndo(changes, record, undoBlockFor(row, record)) };
}

/** One field of the undo preview, values as the screen shows them. */
async function presentPlans(module: string, plans: UndoFieldPlan[]) {
    const labeler = await buildLabeler(await companyFormatsService.load());
    const show = (key: string, value: unknown) => labeler.value(module, key, value);
    return plans.map((plan) => ({
        key: plan.key,
        label: labeler.label(module, plan.key),
        from: show(plan.key, plan.from),
        to: show(plan.key, plan.to),
        current: show(plan.key, plan.current),
        status: plan.status,
        ...(plan.reason ? { reason: plan.reason } : {}),
    }));
}

export const auditActionsService = {
    /** What an undo would do now: each changed field with its value before, after and now, and its status. */
    async undoPreview(params: unknown, user: AuthUser) {
        const { row, plans } = await undoContext(params, user);
        return { id: String(row.id), canUndo: plans.some((plan) => plan.status === 'ready'), fields: await presentPlans(row.module, plans) };
    },

    /**
     * Puts the entry's `ready` fields back (`fields`: only these keys). 409 CONFLICT, with one error per field, when
     * none can be; otherwise the fields undone, those left alone because they changed since (`conflicts`), and any the
     * module didn't take back (`notReverted`, e.g. a value its rules no longer allow).
     */
    async undo(params: unknown, body: unknown, user: AuthUser) {
        const { fields } = auditUndoBodySchema.parse(body ?? {});
        const { row, service, record, plans } = await undoContext(params, user);
        const chosen = fields ? plans.filter((plan) => fields.includes(plan.key)) : plans;
        const ready = chosen.filter((plan) => plan.status === 'ready');
        const conflicts = chosen.filter((plan) => plan.status === 'conflict');
        if (ready.length === 0) {
            const shown = await presentPlans(row.module, conflicts);
            throw HttpError.conflict(
                conflicts.length > 0 ? 'Every field of this change was changed again since, so there is nothing to undo.' : 'Nothing to undo: the fields already hold their earlier values.',
                shown.map((field) => ({ path: [field.key], message: `${field.label} is now “${field.current}”.` })),
            );
        }

        const patch = buildUndoPatch(ready, record);
        const after = (await runAsRevertOf({ id: String(row.id), entityType: row.entityType, entityId: row.entityId }, () =>
            service.update(row.entityId, patch, user),
        )) as Record<string, unknown>;

        const undone = ready.filter((plan) => sameValue(fieldValue(after, plan.key), plan.from));
        const notReverted = ready.filter((plan) => !undone.includes(plan));
        const revert = await findReversal(row.id);
        return {
            id: String(row.id),
            revertId: revert ? String(revert.id) : null,
            undone: await presentPlans(row.module, undone),
            conflicts: await presentPlans(row.module, conflicts),
            notReverted: await presentPlans(row.module, notReverted),
        };
    },

    /** Brings back the record a DELETE entry removed (uniqueness re-checked by the module); writes RESTORE. */
    async restore(params: unknown, user: AuthUser) {
        const row = await loadEntry(params);
        const service = RECORD_SERVICES[row.entityType];
        if (!service || row.action !== 'DELETE') {
            throw new HttpError('Only the delete of a CRM record can be restored.', 409, { code: 'NOT_RESTORABLE' });
        }
        await assertNotReversed(row.id, 'The record was already restored from this entry');
        await service.restore(row.entityId, user, String(row.id));
        const restore = await findReversal(row.id);
        return { id: String(row.id), restoreId: restore ? String(restore.id) : null, entityType: row.entityType, entityId: row.entityId, module: row.module };
    },
};
