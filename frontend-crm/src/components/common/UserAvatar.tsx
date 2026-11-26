'use client';

import { Avatar, type SxProps, type Theme } from '@mui/material';
import { photoSrc } from '@/services/profile.service';

/** `Asha R Kulkarni` → `AK` (first letters of the first and last word); one word → its first two letters. */
export function userInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}

export interface UserAvatarProps {
    /** Name the initials come from (full name, else username). */
    name: string;
    /** Relative (`/api/user-photos/<id>`) or absolute photo URL; initials show when empty or when it fails to load. */
    photoUrl?: string | null;
    /** Diameter in px. */
    size?: number;
    sx?: SxProps<Theme>;
}

/**
 * A user's profile photo, or their initials on the brand gradient (blue in light mode, green in dark mode).
 * The photo is loaded with the session cookie from the API host.
 */
export function UserAvatar({ name, photoUrl, size = 32, sx }: UserAvatarProps) {
    const src = photoSrc(photoUrl);
    return (
        <Avatar
            src={src}
            alt={name}
            sx={[
                {
                    width: size,
                    height: size,
                    flexShrink: 0,
                    fontSize: `${Math.max(0.65, Math.round(size * 0.36) / 16)}rem`,
                    fontWeight: 700,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                    '& img': { objectFit: 'cover' },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {userInitials(name)}
        </Avatar>
    );
}

/** Name to show for the signed-in user: full name when set, else the username. */
export function displayName(user: { username: string; fullName?: string | null }): string {
    return user.fullName?.trim() || user.username;
}
