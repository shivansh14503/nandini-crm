'use client';

import { useEffect } from 'react';
import { FormProvider, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Box, Button, CircularProgress } from '@mui/material';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { FormGrid, RhfPhoneField, RhfTextField } from '@/components/forms';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { FIELD_MAX_LENGTH as L } from '@/config/fieldLimits';
import { useUpdateProfile } from '@/hooks/queries/useProfile';
import { ApiClientError } from '@/services/apiClient';
import type { ProfileDto } from '@/types/profile.types';
import { getFirstErrorMessage } from '@/validations/common';
import { profileSchema, type ProfileFormData } from '@/validations/profile.schema';
import type { Notify } from './ProfileView';
import { ProfileCard, cardButtonLayoutSx, solidButtonSx } from './profileUi';

type ProfileOutput = z.output<typeof profileSchema>;

const FIELDS = ['firstName', 'lastName', 'mobile', 'officePhone'] as const;

const toFormValues = (profile: ProfileDto): ProfileFormData => ({
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    mobile: profile.mobile ?? '',
    officePhone: profile.officePhone ?? '',
});

/** My Profile › Personal details: the four fields a user can change about themselves. */
export function PersonalDetailsCard({ profile, notify }: { profile: ProfileDto; notify: Notify }) {
    const updateProfile = useUpdateProfile();
    const methods = useForm<ProfileFormData, unknown, ProfileOutput>({
        resolver: zodResolver(profileSchema),
        defaultValues: toFormValues(profile),
        mode: 'onTouched',
    });
    const {
        reset,
        setError,
        handleSubmit,
        formState: { isDirty },
    } = methods;

    // A profile refreshed from the server (another tab, a photo change) updates the form unless it is being edited.
    useEffect(() => {
        if (!isDirty) reset(toFormValues(profile));
    }, [profile, isDirty, reset]);

    const onSubmit = handleSubmit(
        async (values) => {
            try {
                const saved = await updateProfile.mutateAsync({
                    firstName: values.firstName,
                    lastName: values.lastName ?? '',
                    mobile: values.mobile ?? '',
                    officePhone: values.officePhone ?? '',
                });
                reset(toFormValues(saved));
                notify('Your details were saved.');
            } catch (err) {
                let message = err instanceof Error && err.message ? err.message : 'Could not save your details.';
                if (err instanceof ApiClientError) {
                    // 400 responses name the offending fields: mark them inline.
                    const fieldErrors = (err.details?.errors ?? []).filter((e) => (FIELDS as readonly string[]).includes(e.path?.[0] ?? ''));
                    fieldErrors.forEach((fieldErr) => setError(fieldErr.path[0] as Path<ProfileFormData>, { type: 'server', message: fieldErr.message }));
                    if (fieldErrors.length > 0) message = fieldErrors[0].message || message;
                }
                notify(message, 'error');
            }
        },
        (errors) => notify(getFirstErrorMessage(errors) ?? 'Please correct the highlighted fields.', 'error'),
    );

    const saving = updateProfile.isPending;

    return (
        <ProfileCard
            id="personal-details"
            icon={<BadgeOutlinedIcon fontSize="small" />}
            title="Personal details"
            description="Your name and phone numbers as colleagues see them across the CRM."
        >
            <FormProvider {...methods}>
                <Box component="form" noValidate onSubmit={onSubmit}>
                    <FormGrid columns={{ xs: 1, md: 2 }}>
                        <RhfTextField<ProfileFormData>
                            name="firstName"
                            label="First Name"
                            required
                            personName
                            maxLength={L.personName}
                            placeholder="e.g. Rajesh"
                            fieldSize="full"
                            slotProps={{ htmlInput: { autoComplete: 'given-name' } }}
                        />
                        <RhfTextField<ProfileFormData>
                            name="lastName"
                            label="Last Name"
                            personName
                            maxLength={L.personName}
                            placeholder="e.g. Kumar"
                            fieldSize="full"
                            slotProps={{ htmlInput: { autoComplete: 'family-name' } }}
                        />
                        <RhfPhoneField<ProfileFormData> name="mobile" label="Mobile" placeholder="e.g. 9876543210" fieldSize="full" />
                        <RhfPhoneField<ProfileFormData> name="officePhone" label="Office Phone" placeholder="e.g. 0112345678" fieldSize="full" />
                    </FormGrid>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap', mt: 2.5 }}>
                        <Button variant="outlined" onClick={() => reset()} disabled={!isDirty || saving} sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={!isDirty || saving}
                            startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                            sx={solidButtonSx}
                        >
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </Box>
                </Box>
            </FormProvider>
        </ProfileCard>
    );
}
