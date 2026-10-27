import type React from 'react';
import type { CrmUser } from './user.types';
import type { ExtendedOrganization } from './organization.types';
import type { Contact } from './contact.types';
import type { NatureOfCallItem } from './ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from './partner.types';

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
}

export interface LookupFilterOption {
    value: string;
    label: string;
}

export interface LookupFilterField {
    key: string;
    label: string;
    type: 'text' | 'select';
    options?: LookupFilterOption[];
    placeholder?: string;
    defaultValue?: string;
    /** Grid width in a 12-column row on desktop (default 3). */
    width?: number;
}

export type LookupFilterValues = Record<string, string>;

export type LookupSearchPredicate<T> = (item: T, filters: LookupFilterValues, query: string) => boolean;

/** Records each built-in lookup preset returns. */
export interface LookupRecordMap {
    user: CrmUser;
    organization: ExtendedOrganization;
    contact: Contact;
    natureOfCall: NatureOfCallItem;
    partnerCompany: PartnerCompany;
    partnerCompanyContact: PartnerCompanyContact;
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
}
