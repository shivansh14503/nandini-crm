import type { TransactionClient } from '../config/prisma.js';

/** Code prefixes per entity: ORG-0001, CON-0001, LD-0001, … */
export const ENTITY_CODE_PREFIX = {
    organization: 'ORG',
    contact: 'CON',
    lead: 'LD',
    opportunity: 'OPP',
    quotation: 'QT',
    product: 'PRD',
    ticket: 'TKT',
} as const;

export type EntityCodePrefix = (typeof ENTITY_CODE_PREFIX)[keyof typeof ENTITY_CODE_PREFIX];

const CODE_PAD_LENGTH = 4;

/**
 * Atomically increments the counter for `prefix` and returns the next code (e.g. `ORG-0042`).
 *
 * Runs as a single MERGE under HOLDLOCK, so concurrent requests serialize on the counter row and never
 * receive the same number, including the very first call, when the row doesn't exist yet. Call it inside
 * the same transaction that inserts the record so a rolled-back insert also releases its number.
 */
export async function generateEntityCode(tx: TransactionClient, prefix: EntityCodePrefix): Promise<string> {
    const rows = await tx.$queryRaw<{ currentValue: number }[]>`
        MERGE [dbo].[SequenceCounter] WITH (HOLDLOCK) AS target
        USING (SELECT ${prefix} AS prefix) AS source
            ON target.[prefix] = source.[prefix]
        WHEN MATCHED THEN
            UPDATE SET [currentValue] = target.[currentValue] + 1
        WHEN NOT MATCHED THEN
            INSERT ([prefix], [currentValue]) VALUES (source.[prefix], 1)
        OUTPUT inserted.[currentValue] AS currentValue;
    `;

    const value = rows[0]?.currentValue;
    if (typeof value !== 'number') {
        throw new Error(`Failed to generate a code for prefix "${prefix}"`);
    }
    return formatEntityCode(prefix, value);
}

/** `ORG` + 7 → `ORG-0007` (numbers past 9999 simply widen: `ORG-12345`). */
export function formatEntityCode(prefix: EntityCodePrefix, value: number): string {
    return `${prefix}-${String(value).padStart(CODE_PAD_LENGTH, '0')}`;
}
