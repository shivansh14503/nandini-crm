'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import type { AvatarIcon, DrawerAvatar } from '@/lib/drawer-layout';

/** Preset avatar icons offered in the builder (keys are stored in the layout). */
export const AVATAR_ICON_OPTIONS: Record<AvatarIcon, { label: string; Icon: SvgIconComponent }> = {
    person: { label: 'Person', Icon: PersonOutlinedIcon },
    group: { label: 'Group', Icon: GroupsOutlinedIcon },
    business: { label: 'Company', Icon: BusinessOutlinedIcon },
    store: { label: 'Store', Icon: StorefrontOutlinedIcon },
    factory: { label: 'Factory', Icon: FactoryOutlinedIcon },
    handshake: { label: 'Deal', Icon: HandshakeOutlinedIcon },
    star: { label: 'Star', Icon: StarOutlineRoundedIcon },
    rocket: { label: 'Rocket', Icon: RocketLaunchOutlinedIcon },
    school: { label: 'Education', Icon: SchoolOutlinedIcon },
    support: { label: 'Support', Icon: SupportAgentOutlinedIcon },
    phone: { label: 'Phone', Icon: PhoneInTalkOutlinedIcon },
    work: { label: 'Work', Icon: WorkOutlineOutlinedIcon },
};

const BRAND_FILL = 'linear-gradient(135deg, var(--crm-fill-blue-600) 0%, var(--crm-fill-blue-700) 100%)';
/** Same red the hand-built lead drawer used for Hot leads (white icon on top in both modes). */
const HOT_FILL = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';

/** Background of the drawer avatar: brand fill (red while Hot); a light tint behind an emoji so it keeps its colours. */
export function avatarBackground(avatar: DrawerAvatar, hot: boolean): string {
    if (avatar.kind === 'emoji') return hot ? 'var(--mui-palette-error-soft)' : 'var(--mui-palette-primary-soft)';
    return hot ? HOT_FILL : BRAND_FILL;
}

/** What sits inside the avatar box: the icon, the emoji, or (initials) nothing, so the drawer shows the title's initials. */
export function avatarContent(avatar: DrawerAvatar, size = 24): React.ReactNode | undefined {
    if (avatar.kind === 'icon') {
        const { Icon } = AVATAR_ICON_OPTIONS[avatar.icon] ?? AVATAR_ICON_OPTIONS.person;
        return <Icon sx={{ fontSize: size, color: '#ffffff' }} />;
    }
    if (avatar.kind === 'emoji') {
        return (
            <Box component="span" role="img" aria-hidden sx={{ fontSize: size + 2, lineHeight: 1, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>
                {avatar.emoji}
            </Box>
        );
    }
    return undefined;
}
