'use client';

import React from 'react';
import { useFormState, useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { taxIdService, type TaxIdField, type TaxIdHolder, type TaxIdOwner } from '@/services/taxId.service';
import { GST_REGEX, PAN_REGEX } from '@/validations/common';

const COMPLETE: Record<TaxIdField, RegExp> = { gstNumber: GST_REGEX, panNumber: PAN_REGEX };
const CHECK_DEBOUNCE_MS = 300;
const DUPLICATE_ERROR = 'duplicate';

export interface UseTaxIdDuplicateCheckOptions {
    owner: TaxIdOwner;
    /** The record being edited, so its own GSTIN / PAN isn't reported. */
    excludeId?: string;
    /** Which of the two identifiers the form has (leads have no PAN). */
    fields?: TaxIdField[];
    /** Off in view mode. */
    enabled?: boolean;
}

const normalize = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '');

/**
 * Flags a GSTIN / PAN another record of the same kind already uses as soon as the value is completely typed (it
 * matches the full format), instead of waiting for the save's 409. The error is set on the field with type
 * `duplicate` and re-applied if validation clears it while the value is unchanged. A value equal to the one the
 * record was loaded with isn't checked, matching the server (legacy shared values stay editable).
 */
export function useTaxIdDuplicateCheck<T extends FieldValues>(
    methods: UseFormReturn<T>,
    { owner, excludeId, fields = ['gstNumber', 'panNumber'], enabled = true }: UseTaxIdDuplicateCheckOptions
): void {
    const { control, setError, clearErrors } = methods;
    const names = fields as unknown as Path<T>[];
    const watched = useWatch({ control, name: names }) as unknown[];
    const { errors, defaultValues } = useFormState({ control, name: names });

    // field → the value to look up (complete and changed), or '' when there's nothing to check.
    const toCheck = fields.map((field, i) => {
        const value = normalize(watched[i]);
        if (!enabled || !COMPLETE[field].test(value)) return '';
        const loaded = normalize((defaultValues as Record<string, unknown> | undefined)?.[field]);
        return excludeId && value === loaded ? '' : value;
    });
    const key = `${owner}|${excludeId ?? ''}|${fields.map((f, i) => `${f}=${toCheck[i]}`).join('|')}`;

    const [result, setResult] = React.useState<{ key: string; holders: TaxIdHolder[] } | null>(null);

    React.useEffect(() => {
        if (!toCheck.some(Boolean)) return;
        const controller = new AbortController();
        const params: Parameters<typeof taxIdService.findHolders>[0] = { owner, excludeId };
        fields.forEach((field, i) => {
            if (toCheck[i]) params[field] = toCheck[i];
        });
        const timer = setTimeout(async () => {
            try {
                const holders = await taxIdService.findHolders(params, controller.signal);
                if (!controller.signal.aborted) setResult({ key, holders });
            } catch {
                // Offline / timeout: say nothing; the save still checks.
            }
        }, CHECK_DEBOUNCE_MS);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
        // `key` encodes owner, excludeId and every value checked.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const holders = result?.key === key ? result.holders : [];
    const errorTypes = fields.map((field) => (errors as Record<string, { type?: string; message?: string } | undefined>)[field]);

    React.useEffect(() => {
        fields.forEach((field, i) => {
            const name = field as unknown as Path<T>;
            const holder = toCheck[i] ? holders.find((h) => h.field === field && h.value === toCheck[i]) : undefined;
            const current = errorTypes[i];
            if (holder) {
                // Don't hide a format / required error behind ours; otherwise (re-)apply it.
                if (!current || (current.type === DUPLICATE_ERROR && current.message !== holder.message)) {
                    setError(name, { type: DUPLICATE_ERROR, message: holder.message });
                }
            } else if (current?.type === DUPLICATE_ERROR) {
                clearErrors(name);
            }
        });
    });
}
