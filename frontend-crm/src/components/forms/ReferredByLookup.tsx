'use client';

import React, { useEffect, useRef } from 'react';
import { useFormContext, useWatch, type FieldPath, type FieldValues, type PathValue } from 'react-hook-form';
import { RhfLookup } from './rhf';
import { FIELD_MAX_LENGTH } from '@/config/fieldLimits';

export interface ReferredByLookupProps<T extends FieldValues> {
    /** The field holding the referral's name (`referredBy`). */
    name: FieldPath<T>;
    /** The sibling field holding the referral's id (`referredById`). */
    idName: FieldPath<T>;
    required?: boolean;
}

/**
 * Referred By of a lead, an opportunity or the Convert Lead form's opportunity: an Active referral of the Referrals
 * module, picked from the Referral Search popup (or typed until it matches one). The name is shown and stored as
 * `name`, the referral's id as `idName`; typing anything else drops the id, and the server then accepts only the
 * value the record already had (a Referred By typed before the Referrals module existed) or an active referral's name.
 */
export function ReferredByLookup<T extends FieldValues>({ name, idName, required }: ReferredByLookupProps<T>) {
    const { control, setValue } = useFormContext<T>();
    const value = (useWatch({ control, name }) as string | undefined) ?? '';
    const id = (useWatch({ control, name: idName }) as string | undefined) ?? '';

    // The name the linked referral had when it was picked / loaded: editing the text away from it unlinks it.
    const linked = useRef<{ id: string; name: string } | undefined>(undefined);
    useEffect(() => {
        if (!id) {
            linked.current = undefined;
            return;
        }
        if (linked.current?.id !== id) {
            linked.current = { id, name: value };
            return;
        }
        if (value.trim().toLowerCase() !== linked.current.name.trim().toLowerCase()) {
            linked.current = undefined;
            setValue(idName, '' as PathValue<T, FieldPath<T>>, { shouldDirty: true });
        }
    }, [id, value, idName, setValue]);

    return (
        <RhfLookup<T, 'referral'>
            name={name}
            label="Referred By"
            lookupType="referral"
            required={required}
            hint="Active referral (Referrals module)"
            placeholder="Search or select referral..."
            nameCase={false}
            maxLength={FIELD_MAX_LENGTH.organizationName}
            onSelectRecord={(referral) => setValue(idName, referral.id as PathValue<T, FieldPath<T>>, { shouldDirty: true })}
            onClearRecord={() => setValue(idName, '' as PathValue<T, FieldPath<T>>, { shouldDirty: true })}
        />
    );
}
