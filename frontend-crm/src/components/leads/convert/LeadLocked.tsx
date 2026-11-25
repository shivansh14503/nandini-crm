'use client';

import React, { createContext, useContext } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { DisabledFields } from '@/components/forms/LockedInputs';

/** Convert Lead field names (`extraFields.<module>.<key>` for extra fields) whose value came from the lead. */
const LeadPrefilledContext = createContext<ReadonlySet<string>>(new Set());

export function LeadPrefilledProvider({ fields, children }: { fields: ReadonlySet<string>; children: React.ReactNode }) {
    return <LeadPrefilledContext.Provider value={fields}>{children}</LeadPrefilledContext.Provider>;
}

/**
 * Shows a Convert Lead field as a disabled, prefilled input when the lead supplied its value (the lead is the source of truth for it, as
 * Organization Name is in the contact section). A field the lead left blank stays editable, and so does a locked one
 * whose value fails validation, so a bad value carried from the lead can still be fixed.
 */
export function LeadLocked({ name, children }: { name: string; children: React.ReactNode }) {
    const prefilled = useContext(LeadPrefilledContext);
    const { control, getFieldState } = useFormContext();
    const formState = useFormState({ control, name });
    const locked = prefilled.has(name) && !getFieldState(name, formState).error;
    return locked ? <DisabledFields>{children}</DisabledFields> : <>{children}</>;
}
