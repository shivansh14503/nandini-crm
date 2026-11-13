'use client';

import React from 'react';
import { useContacts, useOrganizations } from '@/hooks/queries';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { ROUTES } from '@/config/constants';
import type { Contact } from '@/types/contact.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { CONTACT_LOOKUP_PRESET, type ContactLookupRow } from './lookupConfigs';

const NO_ROWS: ContactLookupRow[] = [];

export function ContactLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<Contact>) {
    // Shared, cache-invalidated query: contacts created elsewhere show up without reopening.
    const { data: contacts, refetch } = useContacts(undefined, { enabled: open });
    // Customer Type belongs to the contact's organization.
    const { data: organizations } = useOrganizations(undefined, { enabled: open });
    const { users } = useMasterData();

    const rows = React.useMemo<ContactLookupRow[]>(() => {
        if (!contacts) return NO_ROWS;
        const byId = new Map((organizations ?? []).map((o) => [o.id, o.customerType]));
        const byName = new Map((organizations ?? []).map((o) => [o.organizationName.trim().toLowerCase(), o.customerType]));
        return contacts.map((c) => ({
            ...c,
            customerType:
                (c.organizationId ? byId.get(c.organizationId) : undefined) ??
                byName.get((c.organizationName ?? '').trim().toLowerCase()) ??
                '',
        }));
    }, [contacts, organizations]);

    // Assigned-to options come from the user directory, which loads after module import.
    const filterFields = React.useMemo(() => {
        const owners = users
            .filter((u) => u.status === 'Active')
            .map((u) => ({ value: u.username, label: u.name || u.username }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return CONTACT_LOOKUP_PRESET.filterFields.map((f) => (f.key === 'assignedTo' ? { ...f, options: owners } : f));
    }, [users]);

    // "Create Contact" opens the full contact form in a new tab; coming back reloads the list so the new contact
    // can be picked straight away (lists don't refetch on focus app-wide).
    React.useEffect(() => {
        if (!open) return;
        const onFocus = () => void refetch();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [open, refetch]);

    const selected = selectedValue?.trim().toLowerCase();
    const selectedId = selected ? rows.find((c) => c.name.trim().toLowerCase() === selected)?.id : undefined;
    return (
        <GenericLookupModal<ContactLookupRow>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? rows : NO_ROWS}
            selectedId={selectedId}
            loading={open && !contacts}
            {...CONTACT_LOOKUP_PRESET}
            filterFields={filterFields}
            createAction={{ label: 'Create Contact', onClick: () => window.open(ROUTES.CONTACT_NEW, '_blank', 'noopener') }}
        />
    );
}
