'use client';

import React from 'react';
import { useContacts } from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { CONTACT_LOOKUP_PRESET } from './lookupConfigs';

const NO_CONTACTS: Contact[] = [];

export function ContactLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<Contact>) {
    // Shared, cache-invalidated query: contacts created elsewhere show up without reopening.
    const { data: contacts = NO_CONTACTS } = useContacts();
    const selectedId = contacts.find((c) => c.name === selectedValue)?.id;
    return (
        <GenericLookupModal<Contact>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? contacts : NO_CONTACTS}
            selectedId={selectedId}
            {...CONTACT_LOOKUP_PRESET}
        />
    );
}
