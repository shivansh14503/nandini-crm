import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { z } from 'zod';
import { quotationInputSchema } from '../modules/quotations/quotation.validator.js';
import { convertLeadSchema } from '../modules/leads/lead.validator.js';
import { ticketInputSchema } from '../modules/tickets/ticket.validator.js';

/** Whether `schema` reports an issue on `field` for `{ [field]: value }` (other required fields may fail too). */
function failsOn(schema: z.ZodType, field: string, value: string): boolean {
    const result = schema.safeParse({ [field]: value });
    return !result.success && result.error.issues.some((issue) => issue.path[0] === field);
}

/** Far longer than any limit these fields used to have (500 – 4,000). */
const HUGE = 'Clause. '.repeat(6_000);

/** Long text columns: no character limit, so they must be NVARCHAR(MAX). */
const LONG_TEXT_COLUMNS: Record<string, string[]> = {
    Organization: ['inactivityReason', 'addDescriptionAndScope'],
    Contact: ['addDescription'],
    Lead: ['remarks', 'description'],
    Product: ['description', 'termsAndConditions', 'inactivityReason'],
    Opportunity: ['remarks', 'description'],
    OpportunityLineItem: ['description', 'note'],
    Quotation: ['remarks', 'termsAndConditionDescription', 'paymentTermsDescription', 'notes', 'termsAndConditions'],
    QuotationLineItem: ['description', 'note'],
    Ticket: ['problemReported', 'problemObserved', 'resolution', 'reasonForEscalatedCalls', 'rca', 'addDescription'],
    Contract: ['description'],
    Activity: ['remarks'],
    PartnerCompany: ['addDescription', 'description'],
    BookingLink: ['note'],
};

describe('long text has no character limit', () => {
    it('quotation terms, remarks and notes accept any length', () => {
        for (const field of ['termsAndConditionDescription', 'paymentTermsDescription', 'termsAndConditions', 'remarks', 'notes']) {
            assert.equal(failsOn(quotationInputSchema, field, HUGE), false, field);
        }
    });

    it('Convert Lead descriptions accept any length', () => {
        for (const field of ['organizationDescription', 'contactDescription', 'opportunityDescription']) {
            assert.equal(failsOn(convertLeadSchema, field, HUGE), false, field);
        }
    });

    it('ticket case notes accept any length; Problem Reported is still required', () => {
        for (const field of ['problemReported', 'problemObserved', 'resolution', 'reasonForEscalatedCalls', 'rca', 'addDescription']) {
            assert.equal(failsOn(ticketInputSchema, field, HUGE), false, field);
        }
        assert.equal(failsOn(ticketInputSchema, 'problemReported', '   '), true);
    });

    it('every long text column is NVARCHAR(MAX)', () => {
        const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../prisma/schema.prisma'), 'utf8');
        for (const [model, columns] of Object.entries(LONG_TEXT_COLUMNS)) {
            const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
            for (const column of columns) {
                const type = body.match(new RegExp(`\\n\\s*${column}\\s+String\\??\\s+@db\\.NVarChar\\((\\w+)\\)`))?.[1];
                assert.equal(type, 'Max', `${model}.${column}`);
            }
        }
    });
});
