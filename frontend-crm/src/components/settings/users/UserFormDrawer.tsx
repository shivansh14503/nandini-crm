'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Drawer,
    FormControlLabel,
    IconButton,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { FormField, FormGrid, RhfPhoneField, RhfTextField, ReadOnlyField, fieldSx } from '@/components/forms';
import { SwitchRow } from '@/components/common/SwitchRow';
import { UserAvatar } from '@/components/common/UserAvatar';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { solidButtonSx } from '@/components/profile/profileUi';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { FIELD_MAX_LENGTH as L } from '@/config/fieldLimits';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useCreateAdminUser, useUpdateAdminUser } from '@/hooks/queries/useUserAdmin';
import { userAdminService } from '@/services/userAdmin.service';
import {
    DEPARTMENT_MAX_LENGTH,
    JOB_TITLE_MAX_LENGTH,
    type AdminManagerOption,
    type AdminUserDto,
    type AdminUserUpdateResult,
    type AdminUsersMeta,
    type CreateAdminUserPayload,
    type CreateAdminUserResult,
    type UpdateAdminUserPayload,
} from '@/types/userAdmin.types';
import { isSuperAdminRole, ROLE_NAME_MAX_LENGTH } from '@/utils/roleAccess';
import { firstFreeUsername, normalizeUsername, suggestUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@/utils/username';
import { needsOtherDomain, userFormSchema, type UserFormData, type UserFormOutput } from '@/validations/userAdmin.schema';
import { getFirstErrorMessage } from '@/validations/common';
import { formatPersonName } from '@/utils/personName';
import { holdUnsavedWork } from '@/utils/unsavedWork';
import { formatDayRange } from '@/utils/userAvailability';
import { RoleAccessBadges, apiErrorCode, apiFieldErrors, roleAccessHint, userLabel } from './userAdminUi';

const FORM_FIELDS = [
    'firstName',
    'lastName',
    'username',
    'email',
    'role',
    'jobTitle',
    'department',
    'reportsToId',
    'mobile',
    'officePhone',
    'isGroupUser',
    'onLeave',
] as const;

/** Wait after the last keystroke before checking which usernames are taken. */
const USERNAME_CHECK_DEBOUNCE_MS = 300;

function useDebouncedValue<V>(value: V, delayMs: number): V {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}

/**
 * Add user: the username follows the names as `firstname.lastname` (the next free `…2`, `…3` when it is taken) until the
 * admin types in the Username field; from then on it is theirs. Also says when a typed username is already taken (the
 * API refuses it with 409 anyway). Usernames in use come from the users list (any status), searched by the username.
 */
function useUsernameSuggestion({
    enabled,
    firstName,
    lastName,
    username,
    setUsername,
}: {
    enabled: boolean;
    firstName: string;
    lastName: string;
    username: string;
    setUsername: (value: string) => void;
}): { onUsernameTyped: () => void; takenHint: string | null } {
    const [edited, setEdited] = useState(false);
    const base = enabled ? suggestUsername(firstName, lastName) : '';
    const typed = normalizeUsername(username);
    // What to look up: the suggestion while it is automatic, the typed username once the admin took over.
    const lookup = useDebouncedValue(edited ? typed : base, USERNAME_CHECK_DEBOUNCE_MS);
    const params = { search: lookup, status: 'all' as const, pageSize: 100 };
    const { data } = useQuery({
        queryKey: queryKeys.users.adminList(params),
        queryFn: () => userAdminService.list(params),
        enabled: enabled && lookup.length >= USERNAME_MIN_LENGTH,
        staleTime: 15 * 1000,
    });
    const current = (edited ? typed : base) === lookup;
    const taken = useMemo(() => new Set((data?.data ?? []).map((u) => u.username.toLowerCase())), [data]);
    const suggestion = current ? firstFreeUsername(base, taken) : base;

    useEffect(() => {
        if (!enabled || edited || suggestion === username) return;
        setUsername(suggestion);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only the suggestion drives the field
    }, [enabled, edited, suggestion]);

    const takenHint =
        enabled && edited && current && typed && taken.has(typed)
            ? `"${typed}" is already taken. Try ${firstFreeUsername(typed, taken)}.`
            : enabled && !edited && suggestion !== base && base
              ? `"${base}" is already taken, so ${suggestion} is suggested.`
              : null;
    return { onUsernameTyped: () => setEdited(true), takenHint };
}

const LEAVE_MESSAGE = 'You have unsaved changes to this user. Leave without saving?';

/** Names of a user whose parts were never stored (legacy rows): split from the full name, like My Profile does. */
function nameParts(user: AdminUserDto): { firstName: string; lastName: string } {
    if (user.firstName || user.lastName) return { firstName: user.firstName ?? '', lastName: user.lastName ?? '' };
    const full = user.fullName.trim();
    const space = full.indexOf(' ');
    return space === -1 ? { firstName: full, lastName: '' } : { firstName: full.slice(0, space), lastName: full.slice(space + 1).trim() };
}

const EMPTY_VALUES: UserFormData = {
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    allowOtherDomain: false,
    role: '',
    jobTitle: '',
    department: '',
    reportsToId: null,
    mobile: '',
    officePhone: '',
    isGroupUser: false,
    onLeave: false,
};

/** `companyDomains` is null while the meta is still loading (or failed): nothing is pre-allowed then. */
function toFormValues(user: AdminUserDto | null, companyDomains: readonly string[] | null): UserFormData {
    if (!user) return EMPTY_VALUES;
    const email = user.email ?? '';
    return {
        ...EMPTY_VALUES,
        ...nameParts(user),
        username: user.username,
        email,
        // A saved address outside the company domains was allowed when it was saved: keep it allowed.
        allowOtherDomain: companyDomains !== null && needsOtherDomain(email, companyDomains),
        role: user.role,
        jobTitle: user.jobTitle ?? '',
        department: user.department ?? '',
        reportsToId: user.reportsTo?.id ?? null,
        mobile: user.mobile ?? '',
        officePhone: user.officePhone ?? '',
        isGroupUser: user.isGroupUser,
        onLeave: user.onLeave,
    };
}

/** Only the fields that changed ('' clears an optional text, null clears the manager). */
function changedFields(values: UserFormOutput, initial: UserFormData): UpdateAdminUserPayload {
    const out: UpdateAdminUserPayload = {};
    const text = (v: string | undefined | null) => (v ?? '').trim();
    // Names are compared as the form would save them (name-cased), so a stored "RAJESH" or "McDonald" left untouched
    // isn't re-sent re-cased (which would rename the user and log a name change nobody made).
    const name = (v: string | undefined | null) => (text(v) ? formatPersonName(text(v)) : '');
    if (values.firstName !== name(initial.firstName)) out.firstName = values.firstName;
    if ((values.lastName ?? '') !== name(initial.lastName)) out.lastName = values.lastName ?? '';
    const email = (values.email ?? '').toLowerCase();
    if (email !== text(initial.email).toLowerCase()) {
        out.email = email;
        if (values.allowOtherDomain) out.allowOtherDomain = true;
    }
    if (values.role !== text(initial.role)) out.role = values.role;
    if ((values.jobTitle ?? '') !== text(initial.jobTitle)) out.jobTitle = values.jobTitle ?? '';
    if ((values.department ?? '') !== text(initial.department)) out.department = values.department ?? '';
    if (values.reportsToId !== initial.reportsToId) out.reportsToId = values.reportsToId;
    if ((values.mobile ?? '') !== text(initial.mobile)) out.mobile = values.mobile ?? '';
    if ((values.officePhone ?? '') !== text(initial.officePhone)) out.officePhone = values.officePhone ?? '';
    if (values.isGroupUser !== initial.isGroupUser) out.isGroupUser = values.isGroupUser;
    if (values.onLeave !== initial.onLeave) out.onLeave = values.onLeave;
    return out;
}

function toCreatePayload(values: UserFormOutput): CreateAdminUserPayload {
    const optional = (v: string | undefined) => (v ? v : undefined);
    return {
        username: values.username,
        firstName: values.firstName,
        lastName: optional(values.lastName),
        email: values.email ?? '',
        allowOtherDomain: values.email && values.allowOtherDomain ? true : undefined,
        role: values.role,
        department: optional(values.department),
        jobTitle: optional(values.jobTitle),
        reportsToId: values.reportsToId ?? undefined,
        mobile: optional(values.mobile),
        officePhone: optional(values.officePhone),
        isGroupUser: values.isGroupUser || undefined,
    };
}

/** A titled group of fields in the drawer. */
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    const id = useId();
    return (
        <Box component="section" aria-labelledby={id} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.75, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
                <Box aria-hidden sx={{ display: 'flex', color: 'var(--crm-text-blue-600)' }}>
                    {icon}
                </Box>
                <Typography id={id} component="h3" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                    {title}
                </Typography>
            </Box>
            {children}
        </Box>
    );
}

/** A manager choice; the current manager stays listed (disabled) when no longer pickable. */
type ManagerOption = AdminManagerOption & { inactive?: boolean; note?: string };

const optionRowSx = { display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.84rem', minHeight: 36, py: 0.5 } as const;
const countSx = { ml: 'auto', pl: 1, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', whiteSpace: 'nowrap' } as const;

/**
 * Add / Edit user, in a right drawer (full width on phones). Username is set once at creation and shown read-only
 * when editing. Mount with a `key` per user so the form starts from that user's values.
 */
export function UserFormDrawer({
    open,
    user,
    meta,
    onClose,
    onCreated,
    onSaved,
}: {
    open: boolean;
    /** null = Add user. */
    user: AdminUserDto | null;
    meta: AdminUsersMeta | undefined;
    onClose: () => void;
    onCreated: (result: CreateAdminUserResult) => void;
    onSaved: (user: AdminUserUpdateResult) => void;
}) {
    const mode = user ? 'edit' : 'create';
    const { user: me } = useAuth();
    const isSelf = Boolean(user && me && user.id === me.id);
    const companyDomains = useMemo(() => meta?.companyDomains ?? [], [meta?.companyDomains]);
    const createUser = useCreateAdminUser();
    const updateUser = useUpdateAdminUser();
    const saving = createUser.isPending || updateUser.isPending;
    const [formError, setFormError] = useState<string | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    // Fixed for the drawer's life (it is keyed per user); company domains only arrive with the meta.
    const [initialValues] = useState(() => toFormValues(user, meta ? companyDomains : null));
    const schema = useMemo(() => userFormSchema({ mode, companyDomains }), [mode, companyDomains]);
    const methods = useForm<UserFormData, unknown, UserFormOutput>({
        resolver: zodResolver(schema),
        defaultValues: initialValues,
        mode: 'onTouched',
    });
    const {
        control,
        handleSubmit,
        setError,
        formState: { isDirty },
    } = methods;
    const [email, allowOtherDomain, username, role, firstName, lastName] = useWatch({
        control,
        name: ['email', 'allowOtherDomain', 'username', 'role', 'firstName', 'lastName'],
    });
    const { onUsernameTyped, takenHint } = useUsernameSuggestion({
        enabled: !user,
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        username: username ?? '',
        setUsername: (value) =>
            methods.setValue('username', value, { shouldDirty: true, shouldValidate: methods.getFieldState('username').isTouched }),
    });
    const showOtherDomain = needsOtherDomain(email ?? '', companyDomains) || Boolean(allowOtherDomain && email);

    // Opened before the meta loaded: "allow another domain" starts unticked (every address would look outside the
    // company domains), so once the domains arrive it is set from the saved address, unless the admin already ticked it.
    const domainsApplied = useRef(Boolean(meta));
    useEffect(() => {
        if (!meta || domainsApplied.current) return;
        domainsApplied.current = true;
        if (!user || methods.getValues('allowOtherDomain')) return;
        methods.resetField('allowOtherDomain', { defaultValue: needsOtherDomain(user.email ?? '', meta.companyDomains) });
    }, [meta, user, methods]);

    useLeaveGuard(open && isDirty && !saving, LEAVE_MESSAGE);
    // The leave prompt is off while saving, but the draft still counts as unsaved work until the save lands: a Save
    // answered 401 (the session ended) then opens the sign-in dialog over the drawer instead of unmounting it.
    const holdDraft = open && isDirty;
    useEffect(() => (holdDraft ? holdUnsavedWork() : undefined), [holdDraft]);

    // Only a Super Admin may give the Super Admin role (the API answers 403 SUPER_ADMIN_ONLY otherwise).
    const mayGrantSuperAdmin = isSuperAdminRole(me?.role);
    const roleOptions = useMemo(
        () => (meta?.roles ?? []).map((r) => r.name).filter((name) => mayGrantSuperAdmin || !isSuperAdminRole(name)),
        [meta?.roles, mayGrantSuperAdmin],
    );
    const roleCounts = useMemo(() => new Map((meta?.roles ?? []).map((r) => [r.name, r.userCount])), [meta?.roles]);
    const departmentOptions = useMemo(() => (meta?.departments ?? []).map((d) => d.name), [meta?.departments]);
    const departmentCounts = useMemo(() => new Map((meta?.departments ?? []).map((d) => [d.name, d.userCount])), [meta?.departments]);
    const managerOptions = useMemo<ManagerOption[]>(() => {
        const list: ManagerOption[] = (meta?.managers ?? []).filter((m) => m.id !== user?.id);
        // The current manager was deactivated (or is a group login): keep them in the list so the value still shows.
        const current = user?.reportsTo;
        if (current && !list.some((m) => m.id === current.id)) list.unshift({ id: current.id, name: current.name, username: '', inactive: true, note: current.isActive ? 'not available' : 'inactive' });
        return list;
    }, [meta?.managers, user?.id, user?.reportsTo]);

    const requestClose = () => {
        if (saving) return;
        if (isDirty) setConfirmDiscard(true);
        else onClose();
    };

    const onSubmit = handleSubmit(
        async (values) => {
            setFormError(null);
            try {
                if (!user) {
                    const result = await createUser.mutateAsync(toCreatePayload(values));
                    onCreated(result);
                } else {
                    const payload = changedFields(values, initialValues);
                    if (Object.keys(payload).length === 0) {
                        onClose();
                        return;
                    }
                    const saved = await updateUser.mutateAsync({ id: user.id, payload });
                    onSaved(saved);
                }
            } catch (err) {
                const code = apiErrorCode(err);
                const message = errorMessage(err, user ? 'Could not save the user.' : 'Could not add the user.');
                const fields = apiFieldErrors(err);
                // Role guards (your own admin role, the last admin) and an invalid manager belong to those inputs.
                if (!fields.role && (code === 'SELF_LOCKOUT' || code === 'LAST_ADMIN')) fields.role = message;
                // SUPER_ADMIN_ONLY without a field (editing a Super Admin) falls through to the form error below.
                if (!fields.reportsToId && code === 'INVALID_MANAGER') fields.reportsToId = message;
                const known = Object.entries(fields).filter(([key]) => (FORM_FIELDS as readonly string[]).includes(key));
                known.forEach(([key, text]) => setError(key as Path<UserFormData>, { type: 'server', message: text }, { shouldFocus: true }));
                if (known.length === 0) setFormError(message);
            }
        },
        (errors) => setFormError(getFirstErrorMessage(errors) ?? 'Please correct the highlighted fields.'),
    );

    const title = user ? `Edit ${userLabel(user)}` : 'Add user';

    return (
        <>
            <Drawer
                anchor="right"
                open={open}
                onClose={requestClose}
                aria-labelledby="user-form-title"
                slotProps={{
                    paper: {
                        sx: {
                            width: { xs: '100%', sm: 560 },
                            maxWidth: '100vw',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'var(--mui-palette-background-default)',
                            backgroundImage: 'none',
                        },
                    },
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        px: { xs: 2, sm: 2.5 },
                        py: 1.5,
                        borderBottom: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        flexShrink: 0,
                    }}
                >
                    {user ? <UserAvatar name={userLabel(user)} photoUrl={user.photoUrl} size={36} /> : null}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography id="user-form-title" component="h2" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                            {title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                            {user ? `${user.username}${user.isActive ? '' : ' · Inactive'}` : 'They get an email with a link to set their own password.'}
                        </Typography>
                    </Box>
                    <Tooltip title="Close">
                        <IconButton
                            aria-label="Close"
                            onClick={requestClose}
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '8px',
                                color: 'var(--mui-palette-text-secondary)',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    color: 'var(--mui-palette-error-main)',
                                    backgroundColor: 'var(--mui-palette-error-soft)',
                                },
                            }}
                        >
                            <CloseRoundedIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <FormProvider {...methods}>
                    <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 2.5 }, py: 2.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Section icon={<BadgeOutlinedIcon sx={{ fontSize: 18 }} />} title="Name">
                                <FormGrid columns={{ xs: 1, sm: 2 }}>
                                    <RhfTextField<UserFormData>
                                        name="firstName"
                                        label="First Name"
                                        required
                                        personName
                                        maxLength={L.personName}
                                        placeholder="e.g. Rajesh"
                                        fieldSize="full"
                                        disabled={saving}
                                        slotProps={{ htmlInput: { autoComplete: 'off' } }}
                                    />
                                    <RhfTextField<UserFormData>
                                        name="lastName"
                                        label="Last Name"
                                        personName
                                        maxLength={L.personName}
                                        placeholder="e.g. Kumar"
                                        fieldSize="full"
                                        disabled={saving}
                                        slotProps={{ htmlInput: { autoComplete: 'off' } }}
                                    />
                                </FormGrid>
                            </Section>

                            <Section icon={<KeyOutlinedIcon sx={{ fontSize: 18 }} />} title="Sign-in">
                                <FormGrid columns={{ xs: 1, sm: 2 }}>
                                    {user ? (
                                        <ReadOnlyField
                                            label="Username"
                                            value={user.username}
                                            copyable
                                            hint="Set when the user was added; it never changes."
                                            sx={{ gridColumn: '1 / -1' }}
                                        />
                                    ) : (
                                        <RhfTextField<UserFormData>
                                            name="username"
                                            label="Username"
                                            required
                                            lowercase
                                            maxLength={USERNAME_MAX_LENGTH}
                                            placeholder="e.g. rajesh.kumar"
                                            hint={
                                                takenHint ??
                                                "Filled in from the name as firstname.lastname; you can change it. Used to sign in. Letters, numbers, dots, hyphens and underscores. It can't be changed later."
                                            }
                                            fieldSize="full"
                                            disabled={saving}
                                            onChange={onUsernameTyped}
                                            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false, autoCapitalize: 'none' } }}
                                        />
                                    )}
                                    <Box data-field-size="full" sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                                        <RhfTextField<UserFormData>
                                            name="email"
                                            label="Work email"
                                            type="email"
                                            required={!user}
                                            maxLength={L.email}
                                            placeholder={companyDomains[0] ? `e.g. rajesh.kumar@${companyDomains[0]}` : 'e.g. rajesh.kumar@company.com'}
                                            hint={
                                                user
                                                    ? 'Unique among active people. Used to connect their calendar. Changing it stops any set-password link already sent.'
                                                    : 'The invite to set a password is sent here (the link works once, for 72 hours). Unique among active people.'
                                            }
                                            fieldSize="full"
                                            disabled={saving}
                                            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
                                        />
                                        {showOtherDomain && (
                                            <Controller
                                                control={control}
                                                name="allowOtherDomain"
                                                render={({ field }) => (
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <FormControlLabel
                                                            control={
                                                                <Checkbox
                                                                    size="small"
                                                                    checked={Boolean(field.value)}
                                                                    onChange={(e) => {
                                                                        field.onChange(e.target.checked);
                                                                        void methods.trigger('email');
                                                                    }}
                                                                    disabled={saving}
                                                                />
                                                            }
                                                            label={<Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-700)' }}>Allow an address outside the company domains</Typography>}
                                                            sx={{ ml: 0, minHeight: 36 }}
                                                        />
                                                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                                                            Company domains: {companyDomains.join(', ') || 'none set (Admin › API Integrations)'}.
                                                        </Typography>
                                                    </Box>
                                                )}
                                            />
                                        )}
                                    </Box>
                                </FormGrid>
                            </Section>

                            <Section icon={<WorkOutlineRoundedIcon sx={{ fontSize: 18 }} />} title="Work">
                                <FormGrid columns={{ xs: 1, sm: 2 }}>
                                    <Controller
                                        control={control}
                                        name="role"
                                        render={({ field, fieldState }) => (
                                            <FormField
                                                name="role"
                                                label="Role"
                                                required
                                                size="full"
                                                fit={null}
                                                sx={{ gridColumn: '1 / -1' }}
                                                hint={
                                                    fieldState.error ? undefined : (
                                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                                            <RoleAccessBadges role={role ?? ''} />
                                                            <span>{roleAccessHint(role ?? '')}</span>
                                                            {isSelf ? <span>You can’t remove your own admin role.</span> : null}
                                                        </Box>
                                                    )
                                                }
                                            >
                                                <Autocomplete
                                                    freeSolo
                                                    autoHighlight={false}
                                                    options={roleOptions}
                                                    value={field.value ?? ''}
                                                    inputValue={field.value ?? ''}
                                                    onInputChange={(_, v, reason) => {
                                                        if (reason !== 'reset') field.onChange(v.slice(0, ROLE_NAME_MAX_LENGTH));
                                                    }}
                                                    onChange={(_, v) => field.onChange(typeof v === 'string' ? v : '')}
                                                    disabled={saving}
                                                    renderOption={(props, option) => {
                                                        const { key, ...rest } = props as typeof props & { key: React.Key };
                                                        const count = roleCounts.get(option) ?? 0;
                                                        return (
                                                            <Box component="li" key={key} {...rest} sx={optionRowSx}>
                                                                <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                                                    {option}
                                                                </Box>
                                                                <RoleAccessBadges role={option} />
                                                                <Box component="span" sx={countSx}>
                                                                    {count === 0 ? 'nobody yet' : `${count} ${count === 1 ? 'user' : 'users'}`}
                                                                </Box>
                                                            </Box>
                                                        );
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            inputRef={field.ref}
                                                            onBlur={field.onBlur}
                                                            size="small"
                                                            placeholder="Pick a role or type a new one"
                                                            error={Boolean(fieldState.error)}
                                                            helperText={fieldState.error?.message}
                                                            sx={fieldSx}
                                                        />
                                                    )}
                                                />
                                            </FormField>
                                        )}
                                    />
                                    <RhfTextField<UserFormData>
                                        name="jobTitle"
                                        label="Job title"
                                        maxLength={JOB_TITLE_MAX_LENGTH}
                                        placeholder="e.g. Senior Sales Engineer"
                                        fieldSize="full"
                                        disabled={saving}
                                        slotProps={{ htmlInput: { autoComplete: 'off' } }}
                                    />
                                    <Controller
                                        control={control}
                                        name="department"
                                        render={({ field, fieldState }) => (
                                            <FormField name="department" label="Department" size="full" fit={null}>
                                                <Autocomplete
                                                    freeSolo
                                                    autoHighlight={false}
                                                    options={departmentOptions}
                                                    value={field.value ?? ''}
                                                    inputValue={field.value ?? ''}
                                                    onInputChange={(_, v, reason) => {
                                                        if (reason !== 'reset') field.onChange(v.slice(0, DEPARTMENT_MAX_LENGTH));
                                                    }}
                                                    onChange={(_, v) => field.onChange(typeof v === 'string' ? v : '')}
                                                    disabled={saving}
                                                    renderOption={(props, option) => {
                                                        const { key, ...rest } = props as typeof props & { key: React.Key };
                                                        const count = departmentCounts.get(option) ?? 0;
                                                        return (
                                                            <Box component="li" key={key} {...rest} sx={optionRowSx}>
                                                                <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                                                    {option}
                                                                </Box>
                                                                <Box component="span" sx={countSx}>
                                                                    {count} {count === 1 ? 'user' : 'users'}
                                                                </Box>
                                                            </Box>
                                                        );
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            inputRef={field.ref}
                                                            onBlur={field.onBlur}
                                                            size="small"
                                                            placeholder="Pick or type a department"
                                                            error={Boolean(fieldState.error)}
                                                            helperText={fieldState.error?.message}
                                                            sx={fieldSx}
                                                        />
                                                    )}
                                                />
                                            </FormField>
                                        )}
                                    />
                                    <Controller
                                        control={control}
                                        name="reportsToId"
                                        render={({ field, fieldState }) => {
                                            const selected = managerOptions.find((m) => m.id === field.value) ?? null;
                                            return (
                                                <FormField
                                                    name="reportsToId"
                                                    label="Reports to"
                                                    size="full"
                                                    fit={null}
                                                    sx={{ gridColumn: '1 / -1' }}
                                                    hint={fieldState.error ? undefined : selected?.inactive ? `This manager is ${selected.note}. Pick an active person when you can.` : undefined}
                                                >
                                                    <Autocomplete
                                                        options={managerOptions}
                                                        value={selected}
                                                        onChange={(_, v) => field.onChange(v ? v.id : null)}
                                                        getOptionLabel={(o) => (o.note ? `${o.name} (${o.note})` : o.name)}
                                                        isOptionEqualToValue={(a, b) => a.id === b.id}
                                                        getOptionDisabled={(o) => Boolean(o.inactive)}
                                                        disabled={saving}
                                                        noOptionsText="No active person matches"
                                                        renderOption={(props, option) => {
                                                            const { key, ...rest } = props as typeof props & { key: React.Key };
                                                            return (
                                                                <Box component="li" key={key} {...rest} sx={optionRowSx}>
                                                                    <UserAvatar name={option.name || option.username} photoUrl={option.photoUrl} size={26} />
                                                                    <Box sx={{ minWidth: 0 }}>
                                                                        <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                                                                            {option.name || option.username}
                                                                        </Typography>
                                                                        {option.username ? (
                                                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>{option.username}</Typography>
                                                                        ) : null}
                                                                    </Box>
                                                                </Box>
                                                            );
                                                        }}
                                                        renderInput={(params) => (
                                                            <TextField
                                                                {...params}
                                                                inputRef={field.ref}
                                                                onBlur={field.onBlur}
                                                                size="small"
                                                                placeholder="Nobody (top of the chart)"
                                                                error={Boolean(fieldState.error)}
                                                                helperText={fieldState.error?.message}
                                                                sx={fieldSx}
                                                                slotProps={{
                                                                    ...params.slotProps,
                                                                    input: {
                                                                        ...params.slotProps.input,
                                                                        startAdornment: selected ? (
                                                                            <UserAvatar name={selected.name} photoUrl={selected.photoUrl} size={22} sx={{ ml: 0.5, mr: 0.25 }} />
                                                                        ) : undefined,
                                                                    },
                                                                }}
                                                            />
                                                        )}
                                                    />
                                                </FormField>
                                            );
                                        }}
                                    />
                                </FormGrid>
                            </Section>

                            <Section icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />} title="Contact">
                                <FormGrid columns={{ xs: 1, sm: 2 }}>
                                    <RhfPhoneField<UserFormData> name="mobile" label="Mobile" placeholder="e.g. 9876543210" fieldSize="full" disabled={saving} />
                                    <RhfPhoneField<UserFormData> name="officePhone" label="Office Phone" placeholder="e.g. 0112345678" fieldSize="full" disabled={saving} />
                                </FormGrid>
                            </Section>

                            <Section icon={<TuneRoundedIcon sx={{ fontSize: 18 }} />} title="Flags">
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Controller
                                        control={control}
                                        name="isGroupUser"
                                        render={({ field }) => (
                                            <SwitchRow
                                                checked={Boolean(field.value)}
                                                onChange={field.onChange}
                                                disabled={saving}
                                                label="Group user"
                                                hint="A shared login used by a team, not one person. It can't be picked as a manager and may share an email."
                                            />
                                        )}
                                    />
                                    {user && (
                                        <Controller
                                            control={control}
                                            name="onLeave"
                                            render={({ field }) => (
                                                <SwitchRow
                                                    checked={Boolean(field.value)}
                                                    onChange={field.onChange}
                                                    disabled={saving}
                                                    label="On leave"
                                                    hint="Shown as on leave when someone picks them, and they get no morning summary email. They can still sign in."
                                                />
                                            )}
                                        />
                                    )}
                                    {user?.outOfOffice && (
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, px: 0.5, color: 'var(--mui-palette-text-secondary)' }}>
                                            <EventBusyOutlinedIcon aria-hidden sx={{ fontSize: 16, mt: '2px', flexShrink: 0 }} />
                                            <Typography sx={{ fontSize: '0.75rem', lineHeight: 1.5, color: 'inherit', minWidth: 0, overflowWrap: 'anywhere' }}>
                                                Out of office {formatDayRange(user.outOfOffice.from, user.outOfOffice.to)} (set by the user in My Profile).
                                                {user.outOfOffice.message ? ` “${user.outOfOffice.message}”` : ''}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Section>

                            {formError && (
                                <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.82rem' }}>
                                    {formError}
                                </Alert>
                            )}
                        </Box>

                        {/* Footer */}
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                justifyContent: 'flex-end',
                                flexWrap: 'wrap',
                                px: { xs: 2, sm: 2.5 },
                                pt: 1.5,
                                pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                                borderTop: '1px solid var(--mui-palette-border-main)',
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                flexShrink: 0,
                            }}
                        >
                            <Button
                                variant="outlined"
                                onClick={requestClose}
                                disabled={saving}
                                sx={{ ...secondaryButtonSx, flex: { xs: 1, sm: 'none' }, minHeight: 40 }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={saving || (mode === 'edit' && !isDirty)}
                                startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                                sx={solidButtonSx}
                            >
                                {saving ? 'Saving…' : user ? 'Save changes' : 'Add user'}
                            </Button>
                        </Box>
                    </Box>
                </FormProvider>
            </Drawer>

            <UnsavedChangesModal
                open={confirmDiscard}
                onKeepEditing={() => setConfirmDiscard(false)}
                onDiscardAndLeave={() => {
                    setConfirmDiscard(false);
                    onClose();
                }}
                description="You have unsaved changes to this user. If you close now, they will be lost."
            />
        </>
    );
}
