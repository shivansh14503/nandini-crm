import type React from 'react';
import type { CrmUser } from './user.types';
import type { ExtendedOrganization } from './organization.types';
import type { Contact } from './contact.types';
import type { Opportunity } from './opportunity.types';
import type { NatureOfCallItem } from './ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from './partner.types';
import type { Referral } from './referral.types';

// ─── Generic Lookup / Record Picker Types ─────────────────────────────────────

export interface LookupColumn<T> {
    id: string;
    label: string;
    minWidth?: number;
    width?: number;
    align?: 'left' | 'center' | 'right';
    /** Custom cell renderer; falls back to `getValue` or `String(row[id])`. */
    render?: (row: T) => React.ReactNode;
    getValue?: (row: T) => string;
    /** Adds a clickable sort header (sorts by `getValue` / the row field, case-insensitive). */
    sortable?: boolean;
}

export interface LookupFilterOption {
    value: string;
    label: string;
}

export interface LookupFilterField {
    key: string;
    label: string;
    /** `multiselect` stores its picks in one string; read it with `splitMulti`. */
    type: 'text' | 'select' | 'multiselect';
    options?: LookupFilterOption[];
    placeholder?: string;
    defaultValue?: string;
    /** Grid width in a 12-column row on desktop (default 3). */
    width?: number;
}

export type LookupFilterValues = Record<string, string>;

const MULTI_DELIMITER = '\u001f';
/** Multi-select picks are kept in the string-valued filter map, joined by an unprintable delimiter. */
export const joinMulti = (values: string[]): string => values.join(MULTI_DELIMITER);
export const splitMulti = (value: string | undefined): string[] => (value ? value.split(MULTI_DELIMITER) : []);

export type LookupSearchPredicate<T> = (item: T, filters: LookupFilterValues, query: string) => boolean;

/** Records each built-in lookup preset returns. */
export interface LookupRecordMap {
    user: CrmUser;
    organization: ExtendedOrganization;
    contact: Contact;
    opportunity: Opportunity;
    natureOfCall: NatureOfCallItem;
    partnerCompany: PartnerCompany;
    partnerCompanyContact: PartnerCompanyContact;
    /** Active referrals only (Referred By of leads and opportunities). */
    referral: Referral;
}

export type LookupKind = keyof LookupRecordMap;

/** `custom` means the caller supplies its own `onLookupClick` handler. */
export type LookupType = LookupKind | 'custom';

/** Props shared by every entity-specific lookup modal (UserLookupModal, etc). */
export interface EntityLookupModalProps<T> {
    open: boolean;
    onClose: () => void;
    onSelect: (record: T) => void;
    /** Current field value; the matching record is highlighted. */
    selectedValue?: string;
    /**
     * Filter values the picker opens with, e.g. the organization already chosen on the form. Pickers without
     * those filter fields ignore them.
     */
    initialFilterValues?: LookupFilterValues;
    /**
     * Filters fixed for this picker (e.g. Customer Type = Partner for a Partner Company): applied, shown locked and
     * kept by "Clear". Pickers without those filter fields ignore them.
     */
    lockedFilterValues?: LookupFilterValues;
    /** The picker's wording for one use (e.g. a Partner Company's organization picker). Pickers without it ignore it. */
    copy?: LookupCopy;
}

/**
 * Wording that personalizes a picker for one field, on top of its preset (see `applyLookupCopy`): e.g. the
 * organization picker opened from Partner Company reads "Partner Company Search".
 */
export interface LookupCopy {
    title?: string;
    subtitle?: string;
    emptyMessage?: string;
    /** What the count beside the title counts (default "record" / "records"). */
    recordLabel?: { one: string; other: string };
    /** Filter label / placeholder by filter key. */
    filters?: Record<string, { label?: string; placeholder?: string }>;
    /** Column header by column id; `null` hides the column (e.g. Customer Type when it is locked to one value). */
    columns?: Record<string, string | null>;
}
