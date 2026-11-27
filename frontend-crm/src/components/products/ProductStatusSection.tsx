'use client';

import React, { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Box, Divider } from '@mui/material';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';

import { FormGrid, ReadOnlyField, RhfSelect, SectionLabel } from '@/components/forms';
import { CommonActionModal } from '@/components/common/CommonActionModal';
import { useAuth } from '@/context/AuthContext';
import { useFormMode } from '@/context/FormModeContext';
import { findCrmUser } from '@/services/masterData.store';
import { isAdminUser } from '@/utils/adminRoles';
import { fmtInstant } from '@/utils/formats';
import {
    ACTIVE_PRODUCT_STATUS,
    INACTIVE_PRODUCT_STATUS,
    PRODUCT_STATUSES,
    isActiveProduct,
    type ProductFormData,
} from '@/types/product.types';

/** The saved record's Status values (the form only holds Status and the reason). */
export interface SavedProductStatus {
    status?: string;
    inactiveSince?: string;
    inactivatedBy?: string;
}

/** "Inactive Since" as date + time in the company formats (`24-Oct-2026, 1:07 PM`), '' while unknown. */
export const formatInactiveSince = (iso: string | undefined): string => (iso ? fmtInstant(iso) : '');

/** The admin who made the product Inactive, by name. */
export const inactivatedByName = (username: string | undefined): string => (username ? findCrmUser(username)?.name || username : '');

/**
 * The product's Status section (edit and view; a new product starts Active). Only Admins can change the Status
 * (others see it disabled). Picking Inactive opens a dialog asking for the reason: the change is applied only once
 * a reason is given, and cancelling keeps the previous Status. While Inactive the section also shows Inactive Since
 * (company date format), who made it Inactive and the reason; they are set by the system, not typed into the form.
 */
export function ProductStatusSection({ saved }: { saved: SavedProductStatus | null }) {
    const { mode } = useFormMode();
    const { user } = useAuth();
    const isAdmin = isAdminUser(user);
    const { control, setValue } = useFormContext<ProductFormData>();
    const status = useWatch({ control, name: 'status' }) ?? ACTIVE_PRODUCT_STATUS;
    const reason = useWatch({ control, name: 'inactivityReason' }) ?? '';
    const [askReason, setAskReason] = useState(false);

    const inactive = !isActiveProduct({ status });
    // Picked in this edit but not saved yet: the date and admin are set when it saves.
    const pending = inactive && isActiveProduct(saved);
    const since = pending ? 'On save' : formatInactiveSince(saved?.inactiveSince);
    const by = pending ? inactivatedByName(user?.username) : inactivatedByName(saved?.inactivatedBy);

    return (
        <>
            <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />
            <SectionLabel icon={<ToggleOnOutlinedIcon sx={{ fontSize: 18 }} />} label="Status" />
            <FormGrid columns={3} sx={{ mt: 1 }}>
                <RhfSelect<ProductFormData>
                    name="status"
                    label="Status"
                    options={[...PRODUCT_STATUSES]}
                    disabled={!isAdmin}
                    hint={mode === 'edit' && !isAdmin ? 'Only Admins can change the Status' : undefined}
                    onValueChange={(next, previous) => {
                        if (next === INACTIVE_PRODUCT_STATUS && previous !== INACTIVE_PRODUCT_STATUS) {
                            // Applied only once a reason is given (the dialog's Deactivate).
                            setValue('status', (previous || ACTIVE_PRODUCT_STATUS) as ProductFormData['status']);
                            setAskReason(true);
                            return;
                        }
                        if (next === ACTIVE_PRODUCT_STATUS) setValue('inactivityReason', '', { shouldDirty: true });
                    }}
                />
                {inactive && (
                    <>
                        <ReadOnlyField label="Inactive Since" value={since} hideWhenEmpty sx={{ mb: 2 }} />
                        <ReadOnlyField label="Made Inactive By" value={by} hideWhenEmpty sx={{ mb: 2 }} />
                    </>
                )}
            </FormGrid>
            {inactive && (
                <Box sx={{ minWidth: 0 }}>
                    <ReadOnlyField label="Inactivity Reason" value={reason} hideWhenEmpty sx={{ mb: 2, '& p': { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }} />
                </Box>
            )}
            <CommonActionModal
                open={askReason}
                title="Reason for Inactivity"
                description="Inactive products can't be added to opportunity or quotation line items. Records that already have it keep it."
                reasonLabel="Reason"
                reasonPlaceholder="Why is this product being deactivated?"
                confirmLabel="Deactivate Product"
                confirmColor="warning"
                onConfirm={(text) => {
                    setValue('status', INACTIVE_PRODUCT_STATUS, { shouldDirty: true, shouldValidate: true });
                    setValue('inactivityReason', text, { shouldDirty: true });
                    setAskReason(false);
                }}
                onClose={() => setAskReason(false)}
            />
        </>
    );
}
