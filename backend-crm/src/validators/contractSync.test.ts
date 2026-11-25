import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { DOCUMENT_DEST, expectedFrontendFiles } from '../../scripts/syncPdfDocument.js';
import { DRAWER_LAYOUT_DEST, expectedDrawerLayoutFiles } from '../../scripts/syncDrawerLayout.js';
import { FIELD_MAX_LENGTH } from '../config/fieldLimits.js';
import { TALLY_SERIAL_LENGTH, tallySerialIssue } from './tallySerial.js';
import { leadSourceDetailIssues, PARTNER_LEAD_SOURCE, REFERRED_BY_LEAD_SOURCES } from '../modules/shared/leadSource.js';
import {
    CRM_MODULES,
    CUSTOM_FIELD_TYPES,
    DEFAULT_FIELDS,
    FIELD_TYPES,
    MODULE_TABS,
    sectionKeyFromLabel,
} from '../modules/form-configs/formConfig.defaults.js';

/**
 * Contract between backend-crm and frontend-crm: constants each side keeps its own copy of must agree, or the UI
 * accepts input the API rejects (field limits), renders fields the API doesn't know (field types / modules), or
 * places custom fields in sections the API keys differently (section keys).
 *
 * The frontend modules are loaded at runtime (both are dependency-free) so the backend's `tsc` never compiles
 * frontend files. Skipped, with the reason, only when frontend-crm isn't checked out next to backend-crm.
 */

const FRONTEND_SRC = path.resolve(import.meta.dirname, '../../../frontend-crm/src');
const skip = existsSync(FRONTEND_SRC) ? false : `frontend-crm/src not found at ${FRONTEND_SRC}`;

interface FrontendFieldLimits {
    FIELD_MAX_LENGTH: Record<string, number>;
}

interface FrontendTallySerial {
    TALLY_SERIAL_LENGTH: number;
    tallySerialIssue(value: string | null | undefined, field?: string): string | null;
}

interface FrontendLeadSource {
    REFERRED_BY_LEAD_SOURCES: readonly string[];
    PARTNER_LEAD_SOURCE: string;
    leadSourceDetailIssues(
        values: { leadSource?: string | null; referredBy?: string | null; partnerCompany?: string | null },
        paths?: { referredBy?: string; partnerCompany?: string },
    ): { path: string; message: string }[];
}

interface FrontendFormConfigTypes {
    CRM_MODULE_KEYS: readonly string[];
    CUSTOM_FIELD_TYPES: readonly string[];
    /** Keyed by every `FieldType` (custom types plus lookup / datetime). */
    FIELD_TYPE_LABELS: Record<string, string>;
    sectionKeyFromLabel(label: string): string;
}

async function loadFrontend<T>(relativePath: string): Promise<T> {
    return (await import(pathToFileURL(path.join(FRONTEND_SRC, relativePath)).href)) as T;
}

describe('backend ↔ frontend contract', { skip }, () => {
    it('frontend lib/pdf-document is an exact copy of the PDF document model (run npm run sync:pdf-document)', () => {
        const expected = expectedFrontendFiles();
        assert.deepEqual(readdirSync(DOCUMENT_DEST).sort(), Object.keys(expected).sort());
        for (const [name, content] of Object.entries(expected)) {
            assert.equal(readFileSync(path.join(DOCUMENT_DEST, name), 'utf8'), content, `${name} is out of date`);
        }
    });

    it('frontend lib/drawer-layout is an exact copy of the drawer layout model (run npm run sync:drawer-layout)', () => {
        const expected = expectedDrawerLayoutFiles();
        assert.deepEqual(readdirSync(DRAWER_LAYOUT_DEST).sort(), Object.keys(expected).sort());
        for (const [name, content] of Object.entries(expected)) {
            assert.equal(readFileSync(path.join(DRAWER_LAYOUT_DEST, name), 'utf8'), content, `${name} is out of date`);
        }
    });

    it('fieldLimits.ts has identical keys and values', async () => {
        const frontend = await loadFrontend<FrontendFieldLimits>('config/fieldLimits.ts');
        const sorted = (limits: Record<string, number>) => Object.fromEntries(Object.entries(limits).sort(([a], [b]) => a.localeCompare(b)));
        assert.deepEqual(sorted(frontend.FIELD_MAX_LENGTH), sorted(FIELD_MAX_LENGTH));
    });

    it('Tally Serial No rule and messages match', async () => {
        const frontend = await loadFrontend<FrontendTallySerial>('utils/tallySerial.ts');
        assert.equal(frontend.TALLY_SERIAL_LENGTH, TALLY_SERIAL_LENGTH);
        assert.equal(FIELD_MAX_LENGTH.tallySerialNo, TALLY_SERIAL_LENGTH);
        const samples = ['', '   ', '712345678', ' 712345678 ', '612345678', '71234567', '7123456789', '71234A678', '7-1234567', null, undefined];
        for (const value of samples) {
            assert.equal(frontend.tallySerialIssue(value), tallySerialIssue(value), `value: ${JSON.stringify(value)}`);
        }
    });

    it('Lead Source follow-up rules (Referred By / Partner Company) and messages match', async () => {
        const frontend = await loadFrontend<FrontendLeadSource>('utils/leadSource.ts');
        assert.deepEqual([...frontend.REFERRED_BY_LEAD_SOURCES], [...REFERRED_BY_LEAD_SOURCES]);
        assert.equal(frontend.PARTNER_LEAD_SOURCE, PARTNER_LEAD_SOURCE);
        const sources = ['', 'CA', ' reference ', 'Partner', 'partner', 'Client Referral', 'Website Enquiry', null, undefined];
        for (const leadSource of sources) {
            for (const referredBy of ['', 'Anita Desai', undefined]) {
                for (const partnerCompany of ['', 'ACME PARTNERS', undefined]) {
                    const values = { leadSource, referredBy, partnerCompany };
                    const expected = leadSourceDetailIssues(values).map((i) => ({ path: String(i.path[0]), message: i.message }));
                    assert.deepEqual(frontend.leadSourceDetailIssues(values), expected, JSON.stringify(values));
                }
            }
        }
    });

        it('CRM modules match, in the same (navbar) order', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        assert.deepEqual([...frontend.CRM_MODULE_KEYS], [...CRM_MODULES]);
    });

    it('field types match', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        assert.deepEqual([...frontend.CUSTOM_FIELD_TYPES], [...CUSTOM_FIELD_TYPES]);
        // FIELD_TYPE_LABELS is a Record<FieldType, …>, so its keys are exactly the frontend's FieldType union.
        assert.deepEqual(Object.keys(frontend.FIELD_TYPE_LABELS).sort(), [...FIELD_TYPES].sort());
    });

    it('sectionKeyFromLabel produces the same keys', async () => {
        const frontend = await loadFrontend<FrontendFormConfigTypes>('types/formConfig.types.ts');
        const labels = [
            ...new Set([
                ...DEFAULT_FIELDS.map((f) => f.sectionLabel),
                ...Object.values(MODULE_TABS).flatMap((tabs) => tabs.map((t) => t.label)),
                'PIPELINE & FOLLOW-UP',
                '  Address   Information  ',
                'Compliance/Legal (India)',
                '__Leading_and_trailing__',
                'Ünïcødé — Section',
                '123 Starts With Digits',
                '',
                '!!!',
                'x'.repeat(120),
            ]),
        ];
        for (const label of labels) {
            assert.equal(frontend.sectionKeyFromLabel(label), sectionKeyFromLabel(label), `label: ${JSON.stringify(label)}`);
        }
    });
});
