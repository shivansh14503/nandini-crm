import { contractPeriodMonths, type Contract, type ContractFormData } from '@/types/contract.types';
import { localNow, localToday } from '@/utils/pastDates';

/**
 * Contract term arithmetic. Dates are plain `YYYY-MM-DD` strings and the renewal reminder a wall clock
 * (`YYYY-MM-DDTHH:mm`), so everything is worked out on calendar fields in UTC: no time zone can shift a day.
 */

/** Months a contract runs when its period names no length ("Other", or none picked). */
export const DEFAULT_CONTRACT_MONTHS = 12;
/** The renewal reminder falls this many days before the End Date… */
export const RENEWAL_REMINDER_DAYS_BEFORE = 15;
/** …at this time of day. */
export const RENEWAL_REMINDER_TIME = '11:00';
/** "Expiring in 30 Days" pill: End Date from today up to this many days ahead. */
export const EXPIRING_SOON_DAYS = 30;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC midnight of a `YYYY-MM-DD` the calendar has (2026-02-30 is rejected); null otherwise. */
function parseDay(date: string | null | undefined): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const parsed = new Date(Date.UTC(year, month, day));
    return parsed.getUTCMonth() === month && parsed.getUTCDate() === day ? parsed : null;
}

const formatDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** `date` + `months`, kept on the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). '' for a blank / invalid date. */
export function addMonthsToDate(date: string, months: number): string {
    const start = parseDay(date);
    if (!start) return '';
    const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return formatDay(target);
}

/** `date` + `days` (negative goes back). '' for a blank / invalid date. */
export function addDaysToDate(date: string, days: number): string {
    const start = parseDay(date);
    if (!start) return '';
    start.setUTCDate(start.getUTCDate() + days);
    return formatDay(start);
}

/** End Date the form fills in: Start Date + the period's length, or one year when the period names none. */
export function contractEndDate(startDate: string, period: string | null | undefined): string {
    return addMonthsToDate(startDate, contractPeriodMonths(period ?? '') ?? DEFAULT_CONTRACT_MONTHS);
}

/**
 * Renewal Reminder the form fills in: 15 days before the End Date at 11:00. '' when there is no End Date, or when
 * that moment has already passed (a reminder can't be set in the past, so the form leaves it for the user).
 */
export function renewalReminderFor(endDate: string, now = localNow()): string {
    const day = addDaysToDate(endDate, -RENEWAL_REMINDER_DAYS_BEFORE);
    if (!day) return '';
    const reminder = `${day}T${RENEWAL_REMINDER_TIME}`;
    return reminder < now ? '' : reminder;
}

export type ContractTerm = Pick<ContractFormData, 'startDate' | 'endDate' | 'contractPeriod' | 'renewalReminderDate'>;

/** Start / End / Reminder of a new contract: today, a year on, and 15 days before that at 11:00. */
export function newContractTerm(now = localNow()): Pick<ContractFormData, 'startDate' | 'endDate' | 'renewalReminderDate'> {
    const startDate = now.slice(0, 10);
    const endDate = contractEndDate(startDate, '');
    return { startDate, endDate, renewalReminderDate: renewalReminderFor(endDate, now) };
}

/**
 * The End Date / Renewal Reminder values the form filled in, each null once the user set their own. A value
 * still equal to what the form fills in may follow later changes (Start Date → End Date → Reminder).
 */
export interface AutoFilledTerm {
    endDate: string | null;
    renewalReminderDate: string | null;
}

/**
 * Which of a term's dates still hold the form's own values: End Date = Start Date + the period (or one year,
 * the new-record default), Reminder = 15 days before End Date at 11:00. Used for new and loaded records alike.
 */
export function autoFilledTerm(term: ContractTerm, now = localNow()): AutoFilledTerm {
    const { startDate, endDate, contractPeriod, renewalReminderDate } = term;
    const filledEnd = endDate === contractEndDate(startDate, contractPeriod) || endDate === contractEndDate(startDate, '');
    return {
        endDate: filledEnd ? endDate : null,
        renewalReminderDate: renewalReminderDate === renewalReminderFor(endDate, now) ? renewalReminderDate : null,
    };
}

/** Active contract whose End Date falls between today and 30 days from now (Expired ones are left out). */
export function isContractExpiringSoon(contract: Pick<Contract, 'endDate' | 'status'>, today = localToday()): boolean {
    if (!contract.endDate || contract.status === 'Expired') return false;
    return contract.endDate >= today && contract.endDate <= addDaysToDate(today, EXPIRING_SOON_DAYS);
}

/** `YYYY-MM-DD` (or an ISO timestamp's date) as dd/mm/yyyy, the list's date style; '' when blank / invalid. */
export function formatContractDate(value: string | null | undefined): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
