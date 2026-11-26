'use client';

import { formatPersonName } from '@/utils/personName';
import React, { useMemo, useState } from 'react';
import { FormHelperText } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { LookupField } from '../LookupField';
import { LOOKUP_FIELD_SIZE, resolveFieldSize, type FieldSize } from '../fieldSizing';
import { RecordLookupModal, LOOKUP_DISPLAY_VALUE, findLookupRecord, useActiveReferrals } from '@/components/common/lookup';
import { UserAwayChip } from '@/components/common/UserAwayChip';
import { findCrmUser, formatCrmUserDisplay, getAssignableUserNames, getPartnerCompanies } from '@/services/masterData.store';
import { useContacts, useOpportunities, useOrganizations } from '@/hooks/queries';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { LookupCopy, LookupFilterValues, LookupKind, LookupRecordMap } from '@/types/lookup.types';
import { opportunityLabel } from '@/utils/opportunityLabel';
import { useConfiguredPlaceholder } from '@/context/FormConfigContext';

export interface RhfLookupProps<T extends FieldValues, K extends LookupKind = LookupKind> {
    name: FieldPath<T>;
    label: string;
    options?: string[];
    required?: boolean;
    hint?: React.ReactNode;
    placeholder?: string;
    disabled?: boolean;
    /**
     * Wires the `[ > ]` button to a built-in picker. `custom` (default) defers to `onLookupClick`.
     * For `user`, autocomplete suggestions default to the active user directory when `options` is omitted.
     */
    lookupType?: K | 'custom';
    /** Handler for the `[ > ]` button when `lookupType` is `custom`. */
    onLookupClick?: () => void;
    /** Which user property is written into the field for `lookupType="user"` (default `username`). */
    userValueField?: 'username' | 'name';
    /**
     * Fired with the full record when one is picked from the modal, or when the typed /
     * autocompleted value exactly matches a record — e.g. to auto-populate sibling fields.
     */
    onSelectRecord?: (record: LookupRecordMap[K]) => void;
    /** Fired once when a non-empty value is cleared, via the [X] button or by deleting the text. */
    onClearRecord?: () => void;
    /** Width token for input + action buttons (default `md` for user lookups, `lg` otherwise). */
    fieldSize?: FieldSize;
    /** Values (case-insensitive) left out of the auto-built suggestions, e.g. a record's own name. */
    excludeValues?: string[];
    /** Most characters the input accepts (typed or pasted). */
    maxLength?: number;
    /**
     * Name-cases typed text (default: on for contact lookups). Off for fields where a company or campaign can be
     * typed instead of a person, so "KPMG India" isn't saved as "Kpmg India".
     */
    nameCase?: boolean;
    /**
     * `user` lookups only: someone outside the CRM can be typed as well. The username is stored only when a user is
     * picked or their full name is typed exactly, so typing "Rajesh Kumar & Associates" or a name that starts with a
     * username isn't turned into that user part-way.
     */
    freeText?: boolean;
    /**
     * Filter values the picker opens with. For `opportunity`, an `organizationName` also narrows the suggestions
     * to that organization's opportunities and is preferred when a typed label matches several.
     */
    lookupFilters?: LookupFilterValues;
    /** Filters the picker always applies and shows locked (e.g. Customer Type = Partner for a Partner Company). */
    lockedLookupFilters?: LookupFilterValues;
    /** The picker's wording for this field (e.g. "Partner Company Search"); see LookupCopy. */
    lookupCopy?: LookupCopy;
}

/** React Hook Form bound lookup/autocomplete built on the shared {@link LookupField}. */
export function RhfLookup<T extends FieldValues, K extends LookupKind = LookupKind>({
    name,
    label,
    options,
    required,
    hint,
    placeholder: codedPlaceholder = 'Type or select...',
    disabled,
    lookupType = 'custom',
    onLookupClick,
    userValueField = 'username',
    onSelectRecord,
    onClearRecord,
    fieldSize,
    excludeValues,
    maxLength,
    nameCase,
    freeText = false,
    lookupFilters,
    lockedLookupFilters,
    lookupCopy,
}: RhfLookupProps<T, K>) {
    const { field, fieldState } = useController<T>({ name });
    const placeholder = useConfiguredPlaceholder(name, codedPlaceholder);
    const [modalOpen, setModalOpen] = useState(false);
    const value = (field.value as string) ?? '';

    const kind: K | null = lookupType === 'custom' ? null : lookupType;
    // Organization names are stored uppercase.
    const uppercase = kind === 'organization' || /organizationName$/.test(name);
    // Contact person names are name-cased (CA kept uppercase).
    const personName = nameCase ?? (kind === 'contact' || /contact(Person)?Name$/.test(name));
    // The form keeps the username (API contract); the input and read-only view show the full name.
    const storesUsername = kind === 'user' && userValueField === 'username';
    // Free text: only a stored username is shown as its user's name; anything else stays exactly as typed.
    const userOfValue = storesUsername && freeText ? findCrmUser(value) : undefined;
    const displayValue = !storesUsername ? value : freeText ? (userOfValue?.username === value ? userOfValue.name : value) : formatCrmUserDisplay(value);
    // Every picker field (user, organization, contact…) shares one default width so they line up.
    const size = resolveFieldSize(name, 'lookup', fieldSize ?? LOOKUP_FIELD_SIZE);
    // Subscribes to the user directory so suggestions fill in once it loads (API mode).
    const { users, partnerCompanies } = useMasterData();
    // Records feed both inline suggestions (when no explicit `options`) and exact-match auto-population.
    const { data: organizations } = useOrganizations(undefined, {
        enabled: kind === 'organization' && (!options || Boolean(onSelectRecord)),
    });
    const { data: contacts } = useContacts(undefined, {
        enabled: kind === 'contact' && (!options || Boolean(onSelectRecord)),
    });
    const { data: allOpportunities } = useOpportunities(undefined, {
        enabled: kind === 'opportunity' && (!options || Boolean(onSelectRecord)),
    });
    const { referrals } = useActiveReferrals(kind === 'referral' && (!options || Boolean(onSelectRecord)));
    // The chosen organization's opportunities first (same "contains" match as the picker's filter), so a label
    // that several organizations share resolves to the one on this form.
    const opportunityOrg = lookupFilters?.organizationName?.trim().toLowerCase() ?? '';
    const opportunities = useMemo(() => {
        if (!allOpportunities || !opportunityOrg) return allOpportunities;
        const ofOrg = (o: LookupRecordMap['opportunity']) => (o.organizationName ?? '').toLowerCase().includes(opportunityOrg);
        return [...allOpportunities.filter(ofOrg), ...allOpportunities.filter((o) => !ofOrg(o))];
    }, [allOpportunities, opportunityOrg]);
    const excludeKey = excludeValues?.map((v) => v.trim().toLowerCase()).join('\u0000') ?? '';
    const suggestions = useMemo(() => {
        // User fields always suggest active users by full name; caller-supplied username lists are ignored.
        if (kind === 'user') return getAssignableUserNames();
        if (options) return options;
        if (kind === 'partnerCompany') return getPartnerCompanies().map((p) => p.partnerName);
        const names =
            kind === 'organization'
                ? (organizations ?? []).map((o) => o.organizationName)
                : kind === 'contact'
                  ? (contacts ?? []).map((c) => c.name)
                  : kind === 'opportunity'
                    ? (allOpportunities ?? [])
                          .filter((o) => !opportunityOrg || (o.organizationName ?? '').toLowerCase().includes(opportunityOrg))
                          .map(opportunityLabel)
                    : kind === 'referral'
                      ? referrals.map((r) => r.name)
                      : undefined;
        if (!names) return undefined;
        const excluded = new Set(excludeKey ? excludeKey.split('\u0000') : []);
        const seen = new Set<string>();
        return names.filter((n) => {
            const key = n?.trim().toLowerCase();
            if (!key || excluded.has(key) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        // `users` is the re-render trigger for user suggestions; getAssignableUsernames reads the same directory.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, kind, users, partnerCompanies, organizations, contacts, allOpportunities, referrals, opportunityOrg, excludeKey]);

    const handleSelect = (record: LookupRecordMap[K]) => {
        if (!kind) return;
        const display =
            kind === 'user' && userValueField === 'name'
                ? (record as LookupRecordMap['user']).name
                : LOOKUP_DISPLAY_VALUE[kind](record);
        field.onChange(display);
        onSelectRecord?.(record);
    };

    // Covers the [X] button (LookupField calls onChange('') first) and backspacing the text away.
    // Only fires when there was something to clear, so empty-to-empty updates stay silent.
    const handleChange = (next: string) => {
        // Users are shown by full name but stored by username; partial text is kept as typed until it matches.
        // Free text matches a full name only, exactly as typed (no trimming, no usernames).
        const found = storesUsername ? findCrmUser(next) : undefined;
        const matchedUser = freeText && found && found.name.toLowerCase() !== next.toLowerCase() ? undefined : found;
        field.onChange(matchedUser?.status === 'Active' ? matchedUser.username : next);
        if (!next.trim()) {
            if (value.trim()) onClearRecord?.();
            return;
        }
        if (!kind || !onSelectRecord || next === displayValue) return;
        const match = findLookupRecord(kind, next, { organizations, contacts, opportunities, referrals });
        if (match) onSelectRecord(match);
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size} fit={null} viewValue={storesUsername ? displayValue : undefined}>
            <LookupField
                value={displayValue}
                onChange={handleChange}
                uppercase={uppercase}
                formatValue={personName ? formatPersonName : undefined}
                options={suggestions}
                placeholder={placeholder ?? ''}
                required={required}
                disabled={disabled}
                onLookupClick={kind ? () => setModalOpen(true) : onLookupClick}
                matchMode={kind === 'organization' || kind === 'partnerCompany' ? 'organization' : 'substring'}
                maxLength={maxLength}
                // Away colleagues stay suggested; the chip says so (out of office until …, on leave), as in the picker.
                optionAdornment={kind === 'user' ? (option) => <UserAwayChip user={findCrmUser(option)} /> : undefined}
            />
            {fieldState.error && (
                <FormHelperText error sx={{ mx: 1.75 }}>
                    {fieldState.error.message}
                </FormHelperText>
            )}
            {kind && (
                <RecordLookupModal<K>
                    kind={kind}
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onSelect={handleSelect}
                    selectedValue={value}
                    initialFilterValues={lookupFilters}
                    lockedFilterValues={lockedLookupFilters}
                    copy={lookupCopy}
                />
            )}
        </FormField>
    );
}
