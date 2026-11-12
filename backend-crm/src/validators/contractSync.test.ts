import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { DOCUMENT_DEST, expectedFrontendFiles } from '../../scripts/syncPdfDocument.js';
import { FIELD_MAX_LENGTH } from '../config/fieldLimits.js';
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

    it('fieldLimits.ts has identical keys and values', async () => {
        const frontend = await loadFrontend<FrontendFieldLimits>('config/fieldLimits.ts');
        const sorted = (limits: Record<string, number>) => Object.fromEntries(Object.entries(limits).sort(([a], [b]) => a.localeCompare(b)));
        assert.deepEqual(sorted(frontend.FIELD_MAX_LENGTH), sorted(FIELD_MAX_LENGTH));
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
