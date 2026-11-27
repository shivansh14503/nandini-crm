import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits.js';
import { quotationInputSchema } from '../modules/quotations/quotation.validator.js';
import { convertLeadSchema } from '../modules/leads/lead.validator.js';

/** Whether `schema` reports an issue on `field` for `{ [field]: value }` (other required fields may fail too). */
function failsOn(schema: z.ZodType, field: string, value: string): boolean {
    const result = schema.safeParse({ [field]: value });
    return !result.success && result.error.issues.some((issue) => issue.path[0] === field);
}

const text = (length: number) => 'a'.repeat(length);

describe('long text limits', () => {
    it('quotation terms take up to the terms limit (4,000 characters)', () => {
        for (const field of ['termsAndConditionDescription', 'paymentTermsDescription', 'termsAndConditions']) {
            assert.equal(failsOn(quotationInputSchema, field, text(L.termsText)), false, `${field} at the limit`);
            assert.equal(failsOn(quotationInputSchema, field, text(L.termsText + 1)), true, `${field} over the limit`);
        }
    });

    it('quotation remarks keep the long-text limit', () => {
        assert.equal(failsOn(quotationInputSchema, 'remarks', text(L.longText)), false);
        assert.equal(failsOn(quotationInputSchema, 'remarks', text(L.longText + 1)), true);
    });

    it('Convert Lead caps the organization description at the organization limit', () => {
        assert.equal(failsOn(convertLeadSchema, 'organizationDescription', text(L.organizationDescription)), false);
        assert.equal(failsOn(convertLeadSchema, 'organizationDescription', text(L.organizationDescription + 1)), true);
    });

    it('no long-text limit is wider than the column that stores it', () => {
        const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../prisma/schema.prisma'), 'utf8');
        const width = (model: string, column: string): number => {
            const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
            const size = body.match(new RegExp(`\\n\\s*${column}\\s+String\\??\\s+@db\\.NVarChar\\((\\d+)\\)`))?.[1];
            assert.ok(size, `${model}.${column} not found`);
            return Number(size);
        };
        assert.ok(L.termsText <= width('Quotation', 'termsAndConditionDescription'));
        assert.ok(L.termsText <= width('Quotation', 'paymentTermsDescription'));
        assert.ok(L.termsText <= width('Quotation', 'termsAndConditions'));
        assert.ok(L.organizationDescription <= width('Organization', 'addDescriptionAndScope'));
        assert.ok(L.inactivityReason <= width('Organization', 'inactivityReason'));
        assert.ok(L.longText <= width('Product', 'description'));
    });
});
