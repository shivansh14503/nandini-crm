'use client';

import { useLayoutEffect, useRef } from 'react';
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { CrmModuleKey, FormConfigsPayload } from '@/types/formConfig.types';
import { builtInDropdownDefaults } from '@/utils/formConfig';

/**
 * Admin-chosen dropdown defaults (Form Builder › Dropdowns › ☆) for a new record of a hand-built form. A
 * dropdown with a default pre-selects it; one without leaves the field empty so its placeholder shows.
 */
export interface DropdownDefaultsOptions {
    /** Usually `mode === 'create'`: existing records keep their stored values. */
    enabled: boolean;
    /** Values the caller supplied (e.g. `initialData` from a conversion): those fields keep them. */
    keep?: object | null;
    /**
     * The signed-in user's own defaults (e.g. their default reminder, My Profile › Notifications), applied on top of
     * the admin's and still yielding to `keep`. They may load after the form was created: untouched fields follow.
     */
    personal?: Record<string, string | string[]>;
    /** Fields changed after the form was created (the configuration loaded late or changed), e.g. to sync a mirror. */
    onApply?: (values: Record<string, string | string[]>) => void;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The admin's defaults with the user's own on top, minus the fields `keep` supplies. */
function dropdownDefaults(
    configs: FormConfigsPayload | null | undefined,
    module: CrmModuleKey,
    base: Record<string, unknown>,
    keep: object | null | undefined,
    personal: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
    const kept = (keep ?? {}) as Record<string, unknown>;
    const merged = { ...builtInDropdownDefaults(configs, module, base), ...personal };
    return Object.fromEntries(Object.entries(merged).filter(([key]) => kept[key] === undefined));
}

/**
 * `base` with the module's dropdown fields set to the admin's defaults (as far as the configuration has loaded), and
 * then to the user's own `personal` defaults.
 */
export function withDropdownDefaults<T extends object>(
    configs: FormConfigsPayload | null | undefined,
    module: CrmModuleKey,
    base: T,
    keep?: object | null,
    personal?: Record<string, string | string[]>,
): T {
    return { ...base, ...dropdownDefaults(configs, module, base as Record<string, unknown>, keep, personal) };
}

/**
 * Keeps a new record's dropdown fields on the admin's defaults (and the user's own `personal` ones) when the
 * configuration or the user's preferences load after the form was created, or change while it is open. Only fields
 * the user hasn't changed follow; the new values become the form's defaults, so an untouched form stays clean (no
 * "unsaved changes" prompt).
 */
export function useDropdownDefaults<T extends FieldValues>(
    methods: UseFormReturn<T>,
    module: CrmModuleKey | undefined,
    { enabled, keep, personal, onApply }: DropdownDefaultsOptions,
): void {
    const configs = useFormConfigs();
    const latest = useRef({ keep, personal, onApply });
    useLayoutEffect(() => {
        latest.current = { keep, personal, onApply };
    });
    // By value, so a caller passing a new object each render doesn't re-run the effect.
    const personalKey = JSON.stringify(personal ?? null);

    useLayoutEffect(() => {
        if (!enabled || !module || (!configs && !latest.current.personal)) return;
        const defaults = { ...(methods.control._defaultValues as Record<string, unknown>) };
        const changed: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(dropdownDefaults(configs, module, defaults, latest.current.keep, latest.current.personal))) {
            if (sameValue(defaults[key], value)) continue;
            // The user already picked something: leave it.
            if (!sameValue(methods.getValues(key as Path<T>), defaults[key])) continue;
            changed[key] = value;
        }
        if (Object.keys(changed).length === 0) return;
        methods.reset({ ...defaults, ...changed } as T, {
            keepValues: true,
            keepDirty: true,
            keepErrors: true,
            keepTouched: true,
            keepIsSubmitted: true,
            keepSubmitCount: true,
            keepIsValid: true,
        });
        for (const [key, value] of Object.entries(changed)) {
            methods.setValue(key as Path<T>, value as PathValue<T, Path<T>>, { shouldDirty: false });
        }
        latest.current.onApply?.(changed);
    }, [configs, enabled, module, methods, personalKey]);
}
