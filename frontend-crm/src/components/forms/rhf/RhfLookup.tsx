'use client';

import React, { useMemo, useState } from 'react';
import { FormHelperText } from '@mui/material';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormField } from '../FormField';
import { LookupField } from '../LookupField';
import { resolveFieldSize, type FieldSize } from '../fieldSizing';
import { RecordLookupModal, LOOKUP_DISPLAY_VALUE, findLookupRecord } from '@/components/common/lookup';
import { getAssignableUsernames } from '@/services/masterData.store';
import { useContacts, useOrganizations } from '@/hooks/queries';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { LookupKind, LookupRecordMap } from '@/types/lookup.types';

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
}

/** React Hook Form bound lookup/autocomplete built on the shared {@link LookupField}. */
export function RhfLookup<T extends FieldValues, K extends LookupKind = LookupKind>({
    name,
    label,
    options,
    required,
    hint,
    placeholder,
    disabled,
    lookupType = 'custom',
    onLookupClick,
    userValueField = 'username',
    onSelectRecord,
    onClearRecord,
    fieldSize,
}: RhfLookupProps<T, K>) {
    const { field, fieldState } = useController<T>({ name });
    const [modalOpen, setModalOpen] = useState(false);
    const value = (field.value as string) ?? '';

    const kind: K | null = lookupType === 'custom' ? null : lookupType;
    // Usernames are short; record lookups (organizations, contacts…) keep the wider `lg` default.
    const size = resolveFieldSize(name, 'lookup', fieldSize ?? (kind === 'user' ? 'md' : undefined));
    // Subscribes to the user directory so suggestions fill in once it loads (API mode).
    const { users } = useMasterData();
    const { data: organizations } = useOrganizations(undefined, {
        enabled: kind === 'organization' && Boolean(onSelectRecord),
    });
    const { data: contacts } = useContacts(undefined, {
        enabled: kind === 'contact' && Boolean(onSelectRecord),
    });
    const suggestions = useMemo(
        () => options ?? (kind === 'user' ? getAssignableUsernames() : undefined),
        // `users` is the re-render trigger; getAssignableUsernames reads the same directory.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options, kind, users]
    );

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
        field.onChange(next);
        if (!next.trim()) {
            if (value.trim()) onClearRecord?.();
            return;
        }
        if (!kind || !onSelectRecord || next === value) return;
        const match = findLookupRecord(kind, next, { organizations, contacts });
        if (match) onSelectRecord(match);
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size}>
            <LookupField
                value={value}
                onChange={handleChange}
                options={suggestions}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                onLookupClick={kind ? () => setModalOpen(true) : onLookupClick}
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
                />
            )}
        </FormField>
    );
}
