'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch } from 'react-hook-form';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '@/config/constants';
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout, AppToast } from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import type { Activity } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { ActivityFormFields, useActivityForm } from './ActivityFormFields';
import { ActivityTypeIcon } from './ActivityBadges';
import { formatActivityWhen } from './activityTime';

// ─── Single Source of Truth for Activity Form Tabs ────────────────────────────
export const ACTIVITY_FORM_TABS: (FormTabDefinition & { id: 'overview' })[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <EventNoteOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

export { DEFAULT_ACTIVITY_FORM } from './ActivityFormFields';

export interface ActivityFormProps {
    mode?: 'create' | 'edit' | 'view';
    activityId?: string;
    /** Values a new activity starts with (e.g. from `/activities/new?type=…&start=…`). */
    initialData?: Partial<ActivityFormValues>;
    /** Where Cancel and a save lead back to (default: the activity list). */
    returnTo?: string;
    /** Called after a save instead of going back to the list (e.g. when opened from a drawer). */
    onSaved?: (activity: Activity) => void;
}

export default function ActivityForm({ mode = 'create', activityId, initialData, returnTo = ROUTES.ACTIVITIES, onSaved }: ActivityFormProps) {
    const router = useRouter();
    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise, clock, durationOf, activity, recordLoading, save } = useActivityForm({
        mode,
        activityId,
        prefill: initialData,
    });
    const { formState, control } = methods;
    const { isDirty, isSubmitting } = formState;
    const subject = useWatch({ control, name: 'subject' });
    const followupType = useWatch({ control, name: 'followupType' });

    const canEdit = activity?.viewer?.canEdit ?? true;
    const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Activities', href: ROUTES.ACTIVITIES },
        { label: mode === 'create' ? 'New Activity' : `${mode === 'view' ? 'View' : 'Edit'}: ${subject || 'Activity'}` },
    ];

    const submit = createSubmitHandler(async (values) => {
        try {
            const saved = await save(values);
            if (onSaved) {
                onSaved(saved);
                return;
            }
            setSaveFlash({
                listPath: ROUTES.ACTIVITIES,
                message: mode === 'create' ? 'Activity created successfully!' : 'Activity updated successfully!',
                severity: 'success',
                recordId: saved.id,
            });
            router.push(returnTo);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save activity.', 'error');
        }
    });

    const when = activity ? formatActivityWhen(activity, activity.timeZone || clock.timeZone, clock.now()) : '';

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="activities">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbs}
                    tabs={ACTIVITY_FORM_TABS}
                    activeTab="overview"
                    onCancel={() => router.push(returnTo)}
                    onSave={mode === 'view' ? () => router.push(ROUTES.ACTIVITY_EDIT(activityId!)) : submit}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Activity' : mode === 'edit' ? 'Update Activity' : 'Save Activity'}
                    saveDisabled={mode !== 'create' && !canEdit}
                    saveDisabledTooltip="Only the owner and their managers can change this activity."
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: subject || '',
                        subtitle: when || undefined,
                        avatarIcon: <ActivityTypeIcon type={followupType} sx={{ fontSize: 28, color: 'inherit' }} />,
                        editHref: activityId ? ROUTES.ACTIVITY_EDIT(activityId) : undefined,
                        editLabel: 'Edit Activity',
                        editDisabled: !canEdit,
                        editDisabledTooltip: 'Only the owner and their managers can change this activity.',
                        backHref: ROUTES.ACTIVITIES,
                        audit: activity
                            ? { createdAt: activity.createdAt, createdBy: activity.createdBy, updatedAt: activity.updatedAt, updatedBy: activity.updatedBy }
                            : undefined,
                    }}
                    mode={mode}
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    <ActivityFormFields clock={clock} durationOf={durationOf} />
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
