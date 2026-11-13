import type { TransactionClient } from '../config/prisma.js';
import { generateDocumentCode } from '../modules/document-series/documentSeries.service.js';
import type { SeriesModule } from '../modules/document-series/documentSeries.format.js';

/** Original code prefixes per entity (ORG-0001, CON-0001, LD-0001, …): still recognized by search for older records. */
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

const MODULE_BY_PREFIX = Object.fromEntries(Object.entries(ENTITY_CODE_PREFIX).map(([module, prefix]) => [prefix, module])) as Record<
    EntityCodePrefix,
    SeriesModule
>;

/**
 * The next code of the entity behind `prefix`, in the format an admin set under Document Series
 * (e.g. `NIPL/L/26-27/1004`; `LD-0001` style until one is saved). Atomic and gap-free per transaction: call it
 * first inside the same transaction that inserts the record, so a rolled-back insert also releases its number.
 */
export function generateEntityCode(tx: TransactionClient, prefix: EntityCodePrefix): Promise<string> {
    return generateDocumentCode(tx, MODULE_BY_PREFIX[prefix]);
}
