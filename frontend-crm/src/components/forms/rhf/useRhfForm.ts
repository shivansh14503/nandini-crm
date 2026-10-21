'use client';

import { useCallback, useState } from 'react';
import {
    useForm,
    type DefaultValues,
    type FieldErrors,
    type FieldValues,
    type Resolver,
    type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';
import { getFirstErrorMessage } from '@/validations';

export type FormToastState = {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
};

const CLOSED_TOAST: FormToastState = { open: false, message: '', severity: 'success' };

export interface UseRhfFormOptions<T extends FieldValues> {
    schema: ZodType<unknown>;
    defaultValues: DefaultValues<T>;
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
}: UseRhfFormOptions<T>): UseRhfFormReturn<T> {
    const methods = useForm<T>({
        // zod schemas with defaults have differing input/output types; the form works on the output shape.
        resolver: zodResolver(schema as never) as unknown as Resolver<T>,
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
            methods.handleSubmit(onValid, (errors: FieldErrors<T>) =>
                showToast(getFirstErrorMessage(errors) ?? 'Please correct the highlighted fields.', 'error')
            ),
        [methods, showToast]
    );

    return { methods, toast, showToast, closeToast, createSubmitHandler };
}
