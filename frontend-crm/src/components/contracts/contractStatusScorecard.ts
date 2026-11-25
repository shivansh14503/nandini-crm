import { CONTRACT_STATUSES, CONTRACT_STATUS_CATEGORY, type Contract } from '@/types/contract.types';
import type { DefaultScorecard, ScorecardAmount } from '../common/scorecard/scorecardItems';
import { scorecardNumber, useDropdownScorecard } from '../common/scorecard/stageScorecard';

/**
 * Card color of each built-in contract status (scorecard palette names). Keyed by the stored value, which stays
 * the same when an admin renames the option.
 */
const CONTRACT_STATUS_COLORS: Readonly<Record<string, string>> = {
    'Not Started': 'Sky',
    'In Progress': 'Yellow',
    Signed: 'Teal',
    Expired: 'Red',
};

/**
 * Totals the contract status cards can show. Contract Value is the default, saved as no currency field; it reads
 * the form's own Contract Value, so Admin › List Scorecards doesn't offer that field a second time.
 */
export const CONTRACT_CARD_AMOUNTS: readonly ScorecardAmount<Contract>[] = [
    { key: 'builtin.contractValue', label: 'Contract Value', of: (c) => scorecardNumber(c.contractValue), fieldKey: 'contractValue' },
];

/**
 * The Contracts list's cards until an admin saves a scorecard: one per active contract status, in the admin's
 * order. Statuses added by an admin get the next palette color no other status uses.
 */
export function useContractStatusScorecard(): DefaultScorecard {
    return useDropdownScorecard('status', CONTRACT_STATUS_CATEGORY, CONTRACT_STATUSES, CONTRACT_STATUS_COLORS);
}
