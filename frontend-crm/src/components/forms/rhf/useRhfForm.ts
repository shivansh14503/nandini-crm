'use client';

import { useCallback, useState } from 'react';
import {
    useForm,
    type DefaultValues,
    type FieldErrors,
    type FieldValues,
    type Path,
    type Resolver,
    type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';
import { getFirstErrorMessage } from '@/validations';
import { focusFormField } from '@/utils/formFocus';
import { getFormConfigs } from '@/services/masterData.store';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { validateConfiguredFields } from '@/utils/formConfig';

export type FormToastState = {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
};

const CLOSED_TOAST: FormToastState = { open: false, message: '', severity: 'success' };

export interface UseRhfFormOptions<T extends FieldValues> {
    schema: ZodType<unknown>;
    defaultValues: DefaultValues<T>;
    /**
     * Module whose admin form configuration also applies: required custom fields, built-in fields an admin
     * made required, and custom field formats are validated on top of `schema`.
     */
    module?: CrmModuleKey;
}

export interface UseRhfFormReturn<T extends FieldValues> {
    methods: UseFormReturn<T>;
    toast: FormToastState;
    showToast: (message: string, severity?: FormToastState['severity']) => void;
    closeToast: () => void;
    /** Builds a submit handler that toasts the first zod issue on validation failure. */
    createSubmitHandler: (onValid: (values: T) => Promise<void> | void) => () => Promise<void>;
}

/**
 * Standard form hook for the CRM: React Hook Form + zod resolver + the shared toast convention
 * (first validation error is surfaced in the top-right AppToast, field errors render inline).
 */
export function useRhfForm<T extends FieldValues>({
    schema,
    defaultValues,
    module,
}: UseRhfFormOptions<T>): UseRhfFormReturn<T> {
    const methods = useForm<T>({
        // zod schemas with defaults have differing input/output types; the form works on the output shape.
        resolver: withConfiguredFieldRules(zodResolver(schema as never) as unknown as Resolver<T>, module),
        defaultValues,
        mode: 'onTouched',
    });

    const [toast, setToast] = useState<FormToastState>(CLOSED_TOAST);

    const showToast = useCallback<UseRhfFormReturn<T>['showToast']>(
        (message, severity = 'error') => setToast({ open: true, message, severity }),
        []
    );
    const closeToast = useCallback(() => setToast((t) => ({ ...t, open: false })), []);

    const createSubmitHandler = useCallback<UseRhfFormReturn<T>['createSubmitHandler']>(
        (onValid) =>
            methods.handleSubmit(onValid, (errors: FieldErrors<T>) => {
                showToast(getFirstErrorMessage(errors) ?? 'Please correct the highlighted fields.', 'error');
                const firstField = Object.keys(errors)[0];
                if (firstField && !focusFormField(firstField)) {
                    // Not found in the DOM by name: fall back to RHF's registered ref.
                    methods.setFocus(firstField as Path<T>);
                }
            }),
        [methods, showToast]
    );

    return { methods, toast, showToast, closeToast, createSubmitHandler };
}

/** Sets `message` at a dotted RHF path (`customFields.cf_region`) unless that path already has an error. */
function setNestedError(errors: Record<string, unknown>, path: string, message: string): void {
    const keys = path.split('.');
    let node = errors;
    for (const key of keys.slice(0, -1)) {
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key] as Record<string, unknown>;
    }
    const leaf = keys[keys.length - 1];
    if (!node[leaf]) node[leaf] = { type: 'custom', message };
}

/**
 * Wraps a resolver with the admin's field rules for `module`. The configuration is read at validation time, so
 * forms opened before it loaded (or before an admin change) still validate against the latest rules.
 */
function withConfiguredFieldRules<T extends FieldValues>(base: Resolver<T>, module?: CrmModuleKey): Resolver<T> {
    if (!module) return base;
    return async (values, context, options) => {
        const result = await base(values, context, options);
        const issues = validateConfiguredFields(getFormConfigs(), module, values);
        if (issues.length === 0) return result;
        const errors = { ...(result.errors as Record<string, unknown>) };
        for (const issue of issues) setNestedError(errors, issue.path, issue.message);
        return { values: {}, errors: errors as FieldErrors<T> };
    };
}
