import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { booleanQuery, createdWithinDaysQuery } from '../../validators/common.js';

/** Filters of `GET /api/documents` (besides page, limit, search, sortBy and sortOrder). */
export const documentListQuerySchema = z.object({
    /** The document of one opportunity. */
    opportunityId: z.string().trim().max(50).optional(),
    /** Documents of one organization's opportunities. */
    organizationId: z.string().trim().max(50).optional(),
    /** Documents of one contact person's opportunities. */
    contactId: z.string().trim().max(50).optional(),
    /** Documents of opportunities assigned to this user. */
    assignedTo: z.string().trim().max(L.username).optional(),
    /** Only documents of the signed-in user's opportunities ("My Documents"). */
    mine: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const DOCUMENT_SORT_FIELDS = ['createdAt', 'updatedAt', 'documentNo', 'documentDate'] as const;
