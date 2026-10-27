'use client';

import React, { useMemo } from 'react';
import { contactService } from '@/services';
import type { Contact } from '@/types/contact.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { CONTACT_LOOKUP_PRESET } from './lookupConfigs';

export function ContactLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<Contact>) {
    // Re-read on every open so newly created contacts show up.
    const contacts = useMemo(() => (open ? contactService.getAllSync() : []), [open]);
    const selectedId = contacts.find((c) => c.name === selectedValue)?.id;
    return (
        <GenericLookupModal<Contact>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={contacts}
            selectedId={selectedId}
            {...CONTACT_LOOKUP_PRESET}
        />
    );
}
