'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Chip, FormHelperText, TextField, Typography } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import { useController } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { FormField, fieldSx } from '@/components/forms/FormField';
import { useFormMode } from '@/context/FormModeContext';
import { apiClient } from '@/services/apiClient';
import { findCrmUser, getActiveUsers } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { useBusinessToday, userAwayStatus } from '@/utils/userAvailability';
import type { ApiResponse } from '@/types/api.types';
import type { ActivityAttendee } from '@/types/activity.types';
import { MAX_ACTIVITY_ATTENDEES, type ActivityFormValues } from '@/validations/activity.schema';
import { ATTENDEE_RESPONSE_LABELS, attendeeResponseDot } from './ActivityBadges';

type Group = 'Colleagues' | 'Contacts' | 'Email';

interface AttendeeOption {
    /** `user:<username>` | `contact:<id>` | `email:<address>`: one attendee per identity (as the API keys them). */
    key: string;
    group: Group;
    label: string;
    secondary?: string;
    attendee: ActivityAttendee;
}

/** One contact of `GET /api/lookups/contacts`. */
interface ContactLookup {
    id: string;
    contactCode: string;
    name: string;
    organizationName: string;
    email: string;
}

const emailSchema = z.email();
const isEmail = (value: string) => emailSchema.safeParse(value.trim()).success;

/** The identity an attendee is stored under (the API keeps one row per identity). */
export function attendeeKey(a: Pick<ActivityAttendee, 'kind' | 'username' | 'contactId' | 'email'>): string {
    if (a.kind === 'user') return `user:${(a.username ?? '').trim().toLowerCase()}`;
    if (a.kind === 'contact') return `contact:${(a.contactId ?? '').trim()}`;
    return `email:${(a.email ?? '').trim().toLowerCase()}`;
}

/** The attendee without blank keys (never `email: ''`), so a contact without an email still counts. */
function compact(a: ActivityAttendee): ActivityAttendee {
    return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== '')) as unknown as ActivityAttendee;
}

/** Name shown for an attendee: the colleague's full name, the contact's name, or the email. */
export function attendeeLabel(a: ActivityAttendee): string {
    if (a.kind === 'user') return findCrmUser(a.username)?.name || a.name || a.username || '';
    return a.name || a.email || '';
}

const KIND_ICONS = {
    user: PersonOutlineIcon,
    contact: ContactPhoneOutlinedIcon,
    email: AlternateEmailOutlinedIcon,
} as const;

function AttendeeChipLabel({ attendee }: { attendee: ActivityAttendee }) {
    const Icon = KIND_ICONS[attendee.kind];
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <Icon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {attendeeLabel(attendee)}
            </Box>
            <Box
                component="span"
                title={ATTENDEE_RESPONSE_LABELS[attendee.responseStatus ?? 'needsAction']}
                sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: attendeeResponseDot(attendee.responseStatus), flexShrink: 0 }}
            />
        </Box>
    );
}

const chipSx = {
    height: 26,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    border: '1px solid var(--mui-palette-border-main)',
    maxWidth: '100%',
} as const;

/** Read-only attendee chips (view mode, drawer). */
export function AttendeeChips({ attendees }: { attendees: ActivityAttendee[] }) {
    if (attendees.length === 0) return null;
    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
            {attendees.map((a) => (
                <Chip key={attendeeKey(a)} size="small" label={<AttendeeChipLabel attendee={a} />} sx={chipSx} />
            ))}
        </Box>
    );
}

export interface RhfAttendeesFieldProps {
    name: 'attendees';
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /** Contacts of this organization are offered first. */
    organizationId?: string;
}

/**
 * Attendees: colleagues (the active user directory), contacts (`GET /api/lookups/contacts`, the activity's
 * organization first) and outside email addresses (typed, validated). Chips show the kind and the reply.
 */
export function RhfAttendeesField({ name, label, required, hint, organizationId }: RhfAttendeesFieldProps) {
    const { mode } = useFormMode();
    const { field, fieldState } = useController<ActivityFormValues, 'attendees'>({ name });
    const attendees = useMemo<ActivityAttendee[]>(() => (Array.isArray(field.value) ? field.value : []), [field.value]);
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(input.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [input]);

    // Re-renders when the user directory loads.
    const masters = useMasterData();
    const today = useBusinessToday();
    const colleagues = useMemo<AttendeeOption[]>(
        () =>
            getActiveUsers().map((u) => ({
                key: `user:${u.username.toLowerCase()}`,
                group: 'Colleagues' as const,
                label: u.name || u.username,
                // "Sales Manager • Sales · Out of office until 5 Dec": away colleagues can still be invited.
                secondary: [[u.role, u.department].filter(Boolean).join(' • '), userAwayStatus(u, today)?.label].filter(Boolean).join(' · '),
                attendee: { kind: 'user' as const, username: u.username },
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- getActiveUsers reads the directory `masters` holds
        [masters, today]
    );

    // The organization's contacts until something is typed, then every contact matching it.
    const contactFilter = search ? undefined : organizationId || undefined;
    const { data: contacts = [] } = useQuery<ContactLookup[]>({
        queryKey: ['lookups', 'contacts', search, contactFilter ?? ''],
        queryFn: async () =>
            (await apiClient.get<ApiResponse<ContactLookup[]>>('/api/lookups/contacts', { params: { search: search || undefined, limit: 20, organizationId: contactFilter } }))
                .data,
        enabled: open && mode !== 'view',
        staleTime: 30_000,
    });

    const options = useMemo<AttendeeOption[]>(() => {
        const q = search.toLowerCase();
        const users = q ? colleagues.filter((o) => o.label.toLowerCase().includes(q) || o.key.includes(q)) : colleagues;
        const contactOptions: AttendeeOption[] = contacts.map((c) => ({
            key: `contact:${c.id}`,
            group: 'Contacts',
            label: c.name,
            secondary: [c.contactCode, c.organizationName, c.email].filter(Boolean).join(' · '),
            attendee: compact({ kind: 'contact', contactId: c.id, name: c.name, email: c.email || undefined }),
        }));
        const typed = input.trim().toLowerCase();
        const emailOption: AttendeeOption[] = isEmail(typed)
            ? [{ key: `email:${typed}`, group: 'Email', label: typed, secondary: 'Invite by email', attendee: { kind: 'email', email: typed } }]
            : [];
        return [...users.slice(0, 50), ...contactOptions, ...emailOption];
    }, [colleagues, contacts, search, input]);

    const selected = useMemo<AttendeeOption[]>(
        () => attendees.map((a) => ({ key: attendeeKey(a), group: a.kind === 'user' ? 'Colleagues' : a.kind === 'contact' ? 'Contacts' : 'Email', label: attendeeLabel(a), attendee: a })),
        [attendees]
    );

    const error = fieldState.error?.message ?? (Array.isArray(fieldState.error) ? 'Check the attendees.' : undefined);

    if (mode === 'view') {
        return (
            <FormField name={name} label={label} viewValue={attendees.length > 0 ? <AttendeeChips attendees={attendees} /> : undefined}>
                {null}
            </FormField>
        );
    }

    const change = (next: (AttendeeOption | string)[]) => {
        // Keep each attendee's stored reply; a typed text becomes an email attendee when it is one.
        const before = new Map(attendees.map((a) => [attendeeKey(a), a]));
        const out: ActivityAttendee[] = [];
        const seen = new Set<string>();
        for (const item of next) {
            const option: AttendeeOption | null =
                typeof item === 'string'
                    ? isEmail(item)
                        ? { key: `email:${item.trim().toLowerCase()}`, group: 'Email', label: item.trim().toLowerCase(), attendee: { kind: 'email', email: item.trim().toLowerCase() } }
                        : null
                    : item;
            if (!option || seen.has(option.key)) continue;
            seen.add(option.key);
            out.push(before.get(option.key) ?? compact(option.attendee));
        }
        field.onChange(out.slice(0, MAX_ACTIVITY_ATTENDEES));
        setInput('');
    };

    return (
        <FormField name={name} label={label} required={required} hint={hint} size="full" fit={null}>
            <Autocomplete<AttendeeOption | string, true, false, true>
                multiple
                freeSolo
                size="small"
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                value={selected}
                options={options}
                groupBy={(o) => (typeof o === 'string' ? 'Email' : o.group)}
                filterOptions={(x) => x}
                filterSelectedOptions
                getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
                getOptionKey={(o) => (typeof o === 'string' ? `typed:${o}` : o.key)}
                isOptionEqualToValue={(a, b) => (typeof a === 'string' ? a : a.key) === (typeof b === 'string' ? b : b.key)}
                inputValue={input}
                onInputChange={(_, next, reason) => {
                    if (reason === 'input' || reason === 'clear') setInput(next);
                }}
                onChange={(_, next) => change(next)}
                onBlur={field.onBlur}
                noOptionsText={input ? 'No match. Type a full email address to invite someone outside the CRM.' : 'Type a name or an email'}
                renderOption={(props, option) => {
                    const { key, ...rest } = props as typeof props & { key: React.Key };
                    const o = typeof option === 'string' ? null : option;
                    return (
                        <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', gap: 0.1 }}>
                            <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', maxWidth: '100%' }}>
                                {o ? o.label : String(option)}
                            </Typography>
                            {o?.secondary && (
                                <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', maxWidth: '100%' }}>
                                    {o.secondary}
                                </Typography>
                            )}
                        </Box>
                    );
                }}
                renderValue={(values, getItemProps) =>
                    values.map((option, index) => {
                        const { key, ...itemProps } = getItemProps({ index });
                        const attendee = typeof option === 'string' ? ({ kind: 'email', email: option } as ActivityAttendee) : option.attendee;
                        return <Chip key={key} size="small" {...itemProps} label={<AttendeeChipLabel attendee={attendee} />} sx={chipSx} />;
                    })
                }
                renderInput={(params) => (
                    <TextField
                        {...params}
                        name={name}
                        inputRef={field.ref}
                        placeholder={attendees.length === 0 ? 'Add colleagues, contacts or email addresses...' : undefined}
                        error={Boolean(error)}
                        sx={fieldSx}
                    />
                )}
            />
            {error && <FormHelperText error>{error}</FormHelperText>}
        </FormField>
    );
}
