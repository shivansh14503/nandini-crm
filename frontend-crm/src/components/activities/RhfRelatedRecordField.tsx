'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, CircularProgress, FormHelperText, MenuItem, TextField, Typography } from '@mui/material';
import { useController, useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { FormField, fieldSx } from '@/components/forms/FormField';
import { RecordLink } from '@/components/common/RecordLink';
import { useFormMode } from '@/context/FormModeContext';
import { activityService } from '@/services/activity.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { getModuleColor } from '@/theme/moduleColors';
import {
    ACTIVITY_RELATED_MODULES,
    ACTIVITY_RELATED_MODULE_LABELS,
    isActivityRelatedModule,
    type ActivityLinkTarget,
    type ActivityRelatedModule,
} from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { relatedModuleLabel, relatedRecordHref } from './activityLinks';

const NONE = '';
const SEARCH_DELAY_MS = 250;

export interface RhfRelatedRecordFieldProps {
    /** The Form Builder field (label, required and hidden apply to it); the module and record id travel with it. */
    name: 'relatedTo';
    moduleName?: 'relatedModule';
    idName?: 'relatedId';
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /** Called after a record is picked, e.g. to fill the organization and contact from it. */
    onPicked?: (target: ActivityLinkTarget) => void;
    /** Opens the record when its link is clicked in view mode (else the link follows to the record's page). */
    onOpenRecord?: (module: ActivityRelatedModule, id: string) => void;
}

/** Debounced copy of `value`. */
function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

/**
 * "Related To": the module (Lead, Opportunity, …) plus a record of it, picked from `GET /api/activities/link-targets`
 * (records the user may see). A typed name is never saved: the record is always picked.
 */
export function RhfRelatedRecordField({
    name,
    moduleName = 'relatedModule',
    idName = 'relatedId',
    label,
    required,
    hint,
    onPicked,
    onOpenRecord,
}: RhfRelatedRecordFieldProps) {
    const { mode } = useFormMode();
    const { setValue } = useFormContext<ActivityFormValues>();
    const labelField = useController<ActivityFormValues, 'relatedTo'>({ name });
    const moduleField = useController<ActivityFormValues, 'relatedModule'>({ name: moduleName });
    const idField = useController<ActivityFormValues, 'relatedId'>({ name: idName });
    const pickedModule = isActivityRelatedModule(moduleField.field.value) ? moduleField.field.value : undefined;
    const recordId = typeof idField.field.value === 'string' ? idField.field.value : '';
    const recordLabel = typeof labelField.field.value === 'string' ? labelField.field.value : '';

    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const search = useDebounced(input.trim(), SEARCH_DELAY_MS);
    const { data: targets = [], isFetching } = useQuery<ActivityLinkTarget[]>({
        queryKey: [...queryKeys.activities.all, 'link-targets', pickedModule ?? '', search],
        queryFn: () => activityService.linkTargets({ module: pickedModule!, search: search || undefined, limit: 20 }),
        enabled: Boolean(pickedModule) && open && mode !== 'view',
        staleTime: 30_000,
    });

    const value = useMemo<ActivityLinkTarget | null>(
        () =>
            pickedModule && recordId
                ? { module: pickedModule, id: recordId, code: '', label: recordLabel, organizationName: '', contact: '', assignedTo: '' }
                : null,
        [pickedModule, recordId, recordLabel]
    );
    const error = labelField.fieldState.error?.message ?? idField.fieldState.error?.message;
    const touch = { shouldDirty: true, shouldValidate: true } as const;

    if (mode === 'view') {
        const href = relatedRecordHref(pickedModule, recordId);
        const text = recordLabel ? `${relatedModuleLabel(pickedModule)}${pickedModule ? ': ' : ''}${recordLabel}` : undefined;
        const viewValue =
            text && href ? (
                <RecordLink href={href} onOpen={pickedModule && onOpenRecord ? () => onOpenRecord(pickedModule, recordId) : undefined} sx={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    {text}
                </RecordLink>
            ) : (
                text
            );
        return (
            <FormField name={name} label={label} viewValue={viewValue}>
                {null}
            </FormField>
        );
    }

    const changeModule = (next: string) => {
        if (next === (pickedModule ?? NONE)) return;
        setValue(moduleName, (next || '') as ActivityFormValues['relatedModule'], touch);
        setValue(idName, '', { shouldDirty: true });
        setValue(name, '', touch);
        setInput('');
    };

    const pick = (target: ActivityLinkTarget | null) => {
        if (!target) {
            setValue(idName, '', { shouldDirty: true });
            setValue(name, '', touch);
            return;
        }
        setValue(moduleName, target.module, { shouldDirty: true });
        setValue(idName, target.id, { shouldDirty: true });
        setValue(name, target.label, touch);
        onPicked?.(target);
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint} size="lg" fit={null}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, 0.45fr) minmax(0, 1fr)' },
                    gap: 1,
                    minWidth: 0,
                }}
            >
                <TextField
                    select
                    size="small"
                    value={pickedModule ?? NONE}
                    onChange={(e) => changeModule(e.target.value)}
                    onBlur={labelField.field.onBlur}
                    error={Boolean(error) && !pickedModule}
                    sx={fieldSx}
                    slotProps={{
                        htmlInput: { 'aria-label': `${label} type` },
                        select: {
                            displayEmpty: true,
                            renderValue: (v) =>
                                v ? (
                                    ACTIVITY_RELATED_MODULE_LABELS[v as ActivityRelatedModule]
                                ) : (
                                    <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)' }}>
                                        None
                                    </Box>
                                ),
                        },
                    }}
                >
                    <MenuItem value={NONE} sx={{ fontSize: '0.85rem' }}>
                        None
                    </MenuItem>
                    {ACTIVITY_RELATED_MODULES.map((m) => (
                        <MenuItem key={m} value={m} sx={{ fontSize: '0.85rem', gap: 1 }}>
                            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: getModuleColor(m).main, flexShrink: 0 }} />
                            {ACTIVITY_RELATED_MODULE_LABELS[m]}
                        </MenuItem>
                    ))}
                </TextField>
                <Autocomplete<ActivityLinkTarget, false, false, false>
                    size="small"
                    disabled={!pickedModule}
                    open={open}
                    onOpen={() => setOpen(true)}
                    onClose={() => setOpen(false)}
                    value={value}
                    options={targets}
                    loading={isFetching}
                    filterOptions={(x) => x}
                    getOptionLabel={(o) => o.label}
                    getOptionKey={(o) => `${o.module}:${o.id}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id && a.module === b.module}
                    inputValue={open ? input : recordLabel}
                    onInputChange={(_, next, reason) => {
                        if (reason === 'input') setInput(next);
                        if (reason === 'clear') setInput('');
                    }}
                    onChange={(_, target) => {
                        pick(target);
                        setInput('');
                    }}
                    noOptionsText={search ? 'No matching records' : 'No records to link'}
                    renderOption={(props, option) => {
                        const { key, ...rest } = props as typeof props & { key: React.Key };
                        return (
                            <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', gap: 0.1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, minWidth: 0, maxWidth: '100%' }}>
                                    {option.code && (
                                        <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }}>
                                            {option.code}
                                        </Typography>
                                    )}
                                    <Typography component="span" noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                        {option.label}
                                    </Typography>
                                </Box>
                                {(option.organizationName || option.contact) && (
                                    <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', maxWidth: '100%' }}>
                                        {[option.organizationName, option.contact].filter(Boolean).join(' · ')}
                                    </Typography>
                                )}
                            </Box>
                        );
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            name={name}
                            inputRef={labelField.field.ref}
                            placeholder={pickedModule ? `Search ${ACTIVITY_RELATED_MODULE_LABELS[pickedModule].toLowerCase()}s...` : 'Pick a type first'}
                            error={Boolean(error)}
                            sx={fieldSx}
                            slotProps={{
                                ...params.slotProps,
                                input: {
                                    ...params.slotProps.input,
                                    endAdornment: (
                                        <>
                                            {isFetching && open ? <CircularProgress size={16} /> : null}
                                            {params.slotProps.input.endAdornment}
                                        </>
                                    ),
                                },
                            }}
                        />
                    )}
                />
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </FormField>
    );
}
