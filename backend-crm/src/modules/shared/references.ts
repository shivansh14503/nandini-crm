import { HttpError } from '../../utils/httpError.js';

/**
 * Validates an explicit reference (organizationId, contactId, opportunityId, …). The record must exist; a
 * soft-deleted one is accepted only when the reference is unchanged, so editing an old record never fails
 * because something it points to was archived, but nothing new can be linked to a deleted record.
 */
export function assertReference<T extends { isDeleted: boolean }>(
    found: T | null,
    requestedId: string,
    previousId: string | null | undefined,
    label: string,
    path: string,
): asserts found is T {
    if (!found) {
        throw HttpError.badRequest(`The selected ${label} does not exist.`, [{ message: `Select an existing ${label}.`, path: [path] }]);
    }
    if (found.isDeleted && requestedId !== previousId) {
        throw HttpError.badRequest(`The selected ${label} has been deleted.`, [{ message: `Select an active ${label}.`, path: [path] }]);
    }
}
