// ─── Module scorecards ────────────────────────────────────────────────────────
// Mirrors backend-crm/src/modules/scorecards (GET/PUT/DELETE /api/scorecards).

export interface ScorecardOption {
    /** Stored option value of the field's dropdown. */
    value: string;
    /** "#RRGGBB" chosen by the admin. */
    color: string;
    /** Keeps the color but shows no card for this option. */
    hidden?: boolean;
}

export interface ScorecardConfig {
    module: string;
    /** Form field key of a single-choice dropdown field: one card per option. */
    fieldKey: string;
    /** Form field key of an amount / number field each card totals; null = counts only. */
    currencyFieldKey: string | null;
    options: ScorecardOption[];
    /** The field's list column shows the option colors. */
    listViewColor: boolean;
    /** The record drawer header shows the option colors. */
    drawerViewColor: boolean;
    /** false = an admin switched the cards off (settings kept): the list shows no cards. */
    enabled: boolean;
    /** Wording of the "All" card; null = the screen's own ("All Leads"). */
    allLabel: string | null;
    /** Bumped on every save; sent back on save so a stale screen gets a 409 instead of overwriting. */
    version: number;
    updatedBy: string | null;
    updatedAt: string;
}

export type SaveScorecardPayload = Pick<
    ScorecardConfig,
    'fieldKey' | 'currencyFieldKey' | 'options' | 'listViewColor' | 'drawerViewColor' | 'enabled' | 'allLabel'
> & {
    /** The version the admin edited; null when nothing was saved yet. */
    version: number | null;
};
