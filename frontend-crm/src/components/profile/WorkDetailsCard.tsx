'use client';

import { Box } from '@mui/material';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import type { ProfileDto } from '@/types/profile.types';
import { ProfileCard, formatLongDate } from './profileUi';

/** My Profile › Work details: account facts only an admin can change. */
export function WorkDetailsCard({ profile }: { profile: ProfileDto }) {
    return (
        <ProfileCard
            id="work-details"
            icon={<WorkOutlineRoundedIcon fontSize="small" />}
            title="Work details"
            description={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <InfoOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                    Ask an admin to change these.
                </Box>
            }
        >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 3, rowGap: 2.25 }}>
                <ReadOnlyField label="Username" value={profile.username} copyable />
                <ReadOnlyField label="Role" value={profile.role} />
                <ReadOnlyField label="Department" value={profile.department ?? ''} />
                <ReadOnlyField label="Member since" value={formatLongDate(profile.createdAt)} />
                {/* Full row: an email address is long and should not break mid-word in a half-width column. */}
                <ReadOnlyField
                    label="Work email"
                    value={profile.email ?? ''}
                    copyable={Boolean(profile.email)}
                    sx={{ gridColumn: '1 / -1' }}
                />
            </Box>
        </ProfileCard>
    );
}
