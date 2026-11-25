import { prisma } from '../../config/prisma.js';
import type { ModuleScorecard } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { runInTransaction } from '../shared/transactions.js';
import { HttpError } from '../../utils/httpError.js';
import { toIso } from '../../utils/mappers.js';
import {
    isBuiltInAmountKey,
    moduleHasBuiltInAmount,
    saveScorecardSchema,
    scorecardModuleParamSchema,
    scorecardOptionsSchema,
    type ScorecardOption,
} from './scorecard.validator.js';

/**
 * Scorecards: the summary cards above a module's list screen, set up under Admin › List Scorecards. The admin picks
 * a single-choice dropdown field (one card per option, plus "All"), an optional amount field (or one of the list's
 * built-in totals, `builtin.…`) each card totals, and a color per option (in card order); the colors can also mark
 * that field in the list column and the record view. A scorecard can be switched off (no cards) and keep its
 * settings. Counting runs in the browser over the loaded list.
 */

/** Field types a scorecard can count by / total. */
const DROPDOWN_FIELD_TYPES = new Set(['select']);
const CURRENCY_FIELD_TYPES = new Set(['amount', 'number']);

export interface ScorecardDto {
    module: string;
    fieldKey: string;
    currencyFieldKey: string | null;
    options: ScorecardOption[];
    listViewColor: boolean;
    drawerViewColor: boolean;
    /** false = the list shows no cards (the settings are kept). */
    enabled: boolean;
    /** Wording of the "All" card; null = the screen's own. */
    allLabel: string | null;
    version: number;
    updatedBy: string | null;
    updatedAt: string;
}

function toDto(row: ModuleScorecard): ScorecardDto {
    let options: ScorecardOption[] = [];
    try {
        const parsed = scorecardOptionsSchema.safeParse(JSON.parse(row.optionsJson));
        if (parsed.success) options = parsed.data;
    } catch {
        // A malformed row shows its cards without colors rather than failing the list screen.
    }
    return {
        module: row.module,
        fieldKey: row.fieldKey,
        currencyFieldKey: row.currencyFieldKey,
        options,
        listViewColor: row.listViewColor,
        drawerViewColor: row.drawerViewColor,
        enabled: row.enabled,
        allLabel: row.allLabel,
        version: row.version,
        updatedBy: row.updatedBy,
        updatedAt: toIso(row.updatedAt),
    };
}

/** The settings an audit entry records (who / when are on the entry itself). */
const auditView = ({ updatedBy: _by, updatedAt: _at, module: _module, version: _version, ...settings }: ScorecardDto) => settings;

/** An active form field of the module with one of the given types, or a 400 naming the problem. */
async function requireField(module: string, fieldKey: string, types: Set<string>, what: string) {
    const field = await prisma.formFieldDefinition.findUnique({ where: { module_fieldKey: { module, fieldKey } } });
    if (!field || !field.isActive || !types.has(field.fieldType)) {
        throw HttpError.badRequest(`The selected ${what} is not available on this module's form.`);
    }
    return field;
}

export const scorecardService = {
    /** Every module's scorecard, keyed by module (modules without one are left out). */
    async listAll(): Promise<Record<string, ScorecardDto>> {
        const rows = await prisma.moduleScorecard.findMany();
        return Object.fromEntries(rows.map((row) => [row.module, toDto(row)]));
    },

    async save(params: unknown, body: unknown, user: AuthUser): Promise<ScorecardDto> {
        const { module } = scorecardModuleParamSchema.parse(params);
        const input = saveScorecardSchema.parse(body);

        const field = await requireField(module, input.fieldKey, DROPDOWN_FIELD_TYPES, 'dropdown field');
        if (input.currencyFieldKey) {
            // A built-in total (Grand Total, Tax, …) the module's list works out itself, else an amount form field.
            if (isBuiltInAmountKey(input.currencyFieldKey)) {
                if (!moduleHasBuiltInAmount(module, input.currencyFieldKey)) {
                    throw HttpError.badRequest("The selected currency field is not available on this module's list.");
                }
            } else {
                await requireField(module, input.currencyFieldKey, CURRENCY_FIELD_TYPES, 'currency field');
            }
        }

        // Only values of the field's dropdown (archived ones included, so old records keep their color).
        if (field.dropdownCategoryId && input.options.length > 0) {
            const known = await prisma.dropdownOption.findMany({
                where: { categoryId: field.dropdownCategoryId, value: { in: input.options.map((o) => o.value) } },
                select: { value: true },
            });
            const knownValues = new Set(known.map((o) => o.value));
            const unknown = input.options.find((o) => !knownValues.has(o.value));
            if (unknown) throw HttpError.badRequest(`"${unknown.value}" is not an option of the selected field.`);
        }

        const data = {
            fieldKey: input.fieldKey,
            currencyFieldKey: input.currencyFieldKey ?? null,
            optionsJson: JSON.stringify(input.options),
            listViewColor: input.listViewColor,
            drawerViewColor: input.drawerViewColor,
            enabled: input.enabled,
            allLabel: input.allLabel,
            updatedBy: user.username,
        };
        return runInTransaction(async (tx) => {
            const existing = await tx.moduleScorecard.findUnique({ where: { module } });
            if (existing && existing.version !== input.version) {
                throw HttpError.conflict(
                    `${existing.updatedBy ?? 'Another admin'} saved this scorecard after you opened it. Reload to see their version, then make your changes again.`
                );
            }
            if (!existing && input.version !== null) {
                throw HttpError.conflict('This scorecard was reset to its default after you opened it. Reload, then make your changes again.');
            }
            const row = existing
                ? await tx.moduleScorecard.update({ where: { module }, data: { ...data, version: existing.version + 1 } })
                : await tx.moduleScorecard.create({ data: { module, ...data, version: 1 } });
            const after = auditView(toDto(row));
            await auditService.record(tx, {
                entityType: 'Scorecard',
                entityId: module,
                action: existing ? 'UPDATE' : 'CREATE',
                changedBy: user.username,
                changes: existing ? diffRecords(auditView(toDto(existing)), after) : after,
            });
            return toDto(row);
        });
    },

    /** Back to the screen's built-in cards. */
    async reset(params: unknown, user: AuthUser): Promise<{ module: string }> {
        const { module } = scorecardModuleParamSchema.parse(params);
        await runInTransaction(async (tx) => {
            const existing = await tx.moduleScorecard.findUnique({ where: { module } });
            if (!existing) return;
            await tx.moduleScorecard.delete({ where: { module } });
            await auditService.record(tx, { entityType: 'Scorecard', entityId: module, action: 'DELETE', changedBy: user.username, changes: auditView(toDto(existing)) });
        });
        return { module };
    },
};
