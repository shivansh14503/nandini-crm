import type { ConfigValidationIssue } from '@/utils/formConfig';
import { findFormField } from '@/utils/formFocus';

/**
 * What `CommonFormLayout` needs to walk the user through a form one field at a time: on a new record with several
 * tabs, the primary button reads "Next" until nothing is missing, then "Save"; every check reports the first
 * missing field in the order the form shows them (tab by tab, then top to bottom).
 */
export interface FormStepwise {
    /** Every problem blocking a save right now, in any order (the layout orders them). */
    issues: () => ConfigValidationIssue[];
    /** Shows why the step can't continue (the form's error toast). */
    notify: (message: string) => void;
    /** Tab that renders a field when the form configuration doesn't say (e.g. line items, address blocks). */
    fieldTab?: (path: string) => string | undefined;
}

/**
 * Issues sorted by tab (`tabRank`), then by where their fields sit on screen; fields that aren't mounted keep
 * their given order after the mounted ones of the same tab.
 */
export function orderIssues(issues: ConfigValidationIssue[], tabRank: (path: string) => number): ConfigValidationIssue[] {
    return issues
        .map((issue, index) => ({ issue, index, rank: tabRank(issue.path), el: findFormField(issue.path) }))
        .sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank;
            if (a.el && b.el && a.el !== b.el) return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            if (a.el && !b.el) return -1;
            if (!a.el && b.el) return 1;
            return a.index - b.index;
        })
        .map(({ issue }) => issue);
}
