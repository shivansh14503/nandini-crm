import { CONTRACT_DEFAULT_STATUS } from '../../contracts/contract.validator.js';
import type { DropdownConfigs } from './quotations.values.js';

/**
 * Pure helpers of the contracts import (builders/contracts.ts): the admin's dropdown defaults of the contract form and
 * the term arithmetic the form does (Start Date + Contract Period → End Date → Renewal Reminder). Mirrors
 * frontend-crm/src/components/contracts/contractDates.ts, so an imported contract gets the term the form would fill in.
 */

/** Values a blank cell becomes when no admin default supplies one. Mirrored by IMPORT_DEFAULTS.contracts (frontend). */
export const CONTRACT_IMPORT_DEFAULTS = {
    /** Status when the admin marked no default option (the contract API's own default). */
    status: CONTRACT_DEFAULT_STATUS,
    /** Months a contract runs when its Contract Period names no length ("Other", or none). */
    contractMonths: 12,
    /** The Renewal Reminder falls this many days before the End Date… */
    renewalDaysBefore: 15,
    /** …at this time of day; also the time of a Renewal Reminder Date given without one. */
    renewalTime: '11:00',
} as const;

/** What blank dropdown cells of a contract row become: the admin's default options, as a new contract pre-selects them. */
export interface ContractDropdownDefaults {
    contractTitle: string;
    status: string;
    contractPeriod: string;
    /** Every default option of the multi-select. */
    contractType: string[];
}

/**
 * The contract form's dropdown defaults (frontend `builtInDropdownDefaults`): the admin's first default option (Dropdown
 * Manager ☆) of each built-in single choice, all default options of the Contract Type multi-select, and empty when the
 * dropdown has none. Status then falls back to "Not Started", as the API does.
 */
export function contractDropdownDefaults(configs: DropdownConfigs): ContractDropdownDefaults {
    const fields = configs.fieldsByModule.contracts ?? [];
    const defaults = (fieldKey: string): string[] => {
        const field = fields.find((f) => f.isSystem && f.fieldKey === fieldKey);
        const category = field?.dropdownCategoryId ? configs.categories.find((c) => c.id === field.dropdownCategoryId) : undefined;
        return [...(category?.options ?? [])]
            .filter((o) => o.isActive && o.isDefault)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o) => o.value);
    };
    return {
        contractTitle: defaults('contractTitle')[0] ?? '',
        status: defaults('status')[0] ?? CONTRACT_IMPORT_DEFAULTS.status,
        contractPeriod: defaults('contractPeriod')[0] ?? '',
        contractType: defaults('contractType'),
    };
}

/** Months a Contract Period option names (`1 Year` → 12, `6 Months` → 6); null when it names none. */
export function contractPeriodMonths(period: string | null | undefined): number | null {
    const years = /(\d+)\s*years?/i.exec(period ?? '');
    if (years) return Number(years[1]) * 12;
    const months = /(\d+)\s*months?/i.exec(period ?? '');
    if (months) return Number(months[1]);
    return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC midnight of a `YYYY-MM-DD` the calendar has (2026-02-30 is rejected); null otherwise. */
function parseDay(date: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const parsed = new Date(Date.UTC(year, month, day));
    return parsed.getUTCMonth() === month && parsed.getUTCDate() === day ? parsed : null;
}

const formatDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** `date` + `months`, kept on the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). '' for an invalid date. */
export function addMonthsToDate(date: string, months: number): string {
    const start = parseDay(date);
    if (!start) return '';
    const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return formatDay(target);
}

/** `date` + `days` (negative goes back). '' for an invalid date. */
export function addDaysToDate(date: string, days: number): string {
    const start = parseDay(date);
    if (!start) return '';
    start.setUTCDate(start.getUTCDate() + days);
    return formatDay(start);
}

/** End Date the form fills in: Start Date + the period's length, or one year when the period names none. */
export function contractEndDate(startDate: string, period: string | null | undefined): string {
    return addMonthsToDate(startDate, contractPeriodMonths(period) ?? CONTRACT_IMPORT_DEFAULTS.contractMonths);
}

/**
 * Renewal Reminder the form fills in: 15 days before the End Date at 11:00. '' when there is no End Date or that
 * moment has already passed (`now` is the business wall clock `YYYY-MM-DDTHH:mm`): a reminder can't be in the past.
 */
export function renewalReminderFor(endDate: string, now: string): string {
    const day = addDaysToDate(endDate, -CONTRACT_IMPORT_DEFAULTS.renewalDaysBefore);
    if (!day) return '';
    const reminder = `${day}T${CONTRACT_IMPORT_DEFAULTS.renewalTime}`;
    return reminder < now ? '' : reminder;
}

/** A Renewal Reminder Date cell as read by `buildImportPayload` (`YYYY-MM-DD[THH:mm]`): a date alone is at 11:00. */
export function reminderCell(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    return value.includes('T') ? value : `${value}T${CONTRACT_IMPORT_DEFAULTS.renewalTime}`;
}
