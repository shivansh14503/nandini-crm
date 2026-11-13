'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { moduleFields, validateConfiguredFields, type ConfigValidationIssue } from '@/utils/formConfig';
import { pastDateIssues, type PastDateField } from '@/utils/pastDates';
import { useDropdownDefaults, withDropdownDefaults, type DropdownDefaultsOptions } from './useDropdownDefaults';

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
    /**
     * Pre-selects the admin's default option of each built-in dropdown of `module` (empty when a dropdown has
     * none, so its placeholder shows) instead of the form's hard-coded value. Enable for new records only.
     */
    dropdownDefaults?: Omit<DropdownDefaultsOptions, 'onApply'>;
    /**
     * Further configuration-driven rules, for forms that collect other modules' fields (e.g. Convert Lead requires
     * what the organization / opportunity configurations require). Read at validation time, like `module`.
     */
    extraRules?: (values: T) => ConfigValidationIssue[];
    /**
     * Built-in date / date-time fields that can't be set in the past. `module`'s custom date fields are added
     * automatically. Values equal to the form's loaded defaults (an existing record's own dates) still pass.
     */
    noPastDates?: PastDateField[];
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
    dropdownDefaults,
    extraRules,
    noPastDates,
}: UseRhfFormOptions<T>): UseRhfFormReturn<T> {
    // Read once, like useForm's own defaultValues. A configuration loading later is applied by useDropdownDefaults.
    const [initialValues] = useState(() =>
        module && dropdownDefaults?.enabled ? withDropdownDefaults(getFormConfigs(), module, defaultValues, dropdownDefaults.keep) : defaultValues,
    );
    // The resolver reads the form's current defaults (updated by `reset` when an existing record loads), so an
    // existing record's own past dates still validate. The ref is read only when validation runs, never in render.
    const formRef = useRef<UseFormReturn<T> | null>(null);
    /* eslint-disable react-hooks/refs -- `initial` is called by the resolver when validation runs, not during render */
    const methods = useForm<T>({
        // zod schemas with defaults have differing input/output types; the form works on the output shape.
        resolver: withConfiguredFieldRules(zodResolver(schema as never) as unknown as Resolver<T>, module, extraRules, {
            fields: noPastDates ?? [],
            initial: () => formRef.current?.formState.defaultValues ?? initialValues,
        }),
        defaultValues: initialValues,
        mode: 'onTouched',
    });
    /* eslint-enable react-hooks/refs */
    useEffect(() => {
        formRef.current = methods;
    }, [methods]);
    useDropdownDefaults(methods, module, { enabled: Boolean(dropdownDefaults?.enabled), keep: dropdownDefaults?.keep });

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
function withConfiguredFieldRules<T extends FieldValues>(
    base: Resolver<T>,
    module: CrmModuleKey | undefined,
    extraRules: ((values: T) => ConfigValidationIssue[]) | undefined,
    pastDates: { fields: PastDateField[]; initial: () => unknown },
): Resolver<T> {
    if (!module && !extraRules && pastDates.fields.length === 0) return base;
    return async (values, context, options) => {
        const result = await base(values, context, options);
        const configs = getFormConfigs();
        // Admin-defined date fields of the module can't be set in the past either.
        const customDates: PastDateField[] = module
            ? moduleFields(configs, module)
                  .filter((f) => !f.isSystem && f.isActive && f.fieldType === 'date')
                  .map((f) => ({ name: `customFields.${f.fieldKey}`, label: f.label, kind: 'date' as const }))
            : [];
        const issues = [
            ...(module ? validateConfiguredFields(configs, module, values) : []),
            ...(extraRules?.(values) ?? []),
            ...pastDateIssues([...pastDates.fields, ...customDates], values, pastDates.initial()),
        ];
        if (issues.length === 0) return result;
        const errors = { ...(result.errors as Record<string, unknown>) };
        for (const issue of issues) setNestedError(errors, issue.path, issue.message);
        return { values: {}, errors: errors as FieldErrors<T> };
    };
}
