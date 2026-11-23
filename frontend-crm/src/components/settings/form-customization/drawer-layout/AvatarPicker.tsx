'use client';

import React, { useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { AVATAR_ICONS, type AvatarIcon, type DrawerAvatar } from '@/lib/drawer-layout';
import { AVATAR_ICON_OPTIONS, avatarBackground, avatarContent } from '@/components/common/Drawer/layout';

/** Avatar choice for the drawer header: one of the preset icons, the title's initials, or one of a set of emoji. */

const QUICK_EMOJI = ['🙂', '😎', '🤝', '💼', '🏢', '🏭', '🏪', '🚀', '⭐', '🔥', '💡', '🎯', '📞', '📧', '🛒', '🧾', '🥛', '🐄', '🌱', '🏆', '💎', '🎓', '🛠️', '🇮🇳'];

type Kind = DrawerAvatar['kind'];

const tileSx = (on: boolean) => ({
    width: 44,
    height: 44,
    borderRadius: '10px',
    display: 'grid',
    placeItems: 'center',
    border: on ? '2px solid var(--crm-fill-blue-600)' : '1px solid var(--mui-palette-border-main)',
    boxShadow: on ? '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.18)' : 'none',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.12s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
    '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.3)' },
});

export function AvatarPicker({ value, onChange, title, disabled }: { value: DrawerAvatar; onChange: (avatar: DrawerAvatar) => void; title: string; disabled?: boolean }) {
    const [kind, setKind] = useState<Kind>(value.kind);
    const initials = title
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    const pickKind = (next: Kind) => {
        setKind(next);
        if (next === 'initials') onChange({ kind: 'initials' });
        if (next === 'icon' && value.kind !== 'icon') onChange({ kind: 'icon', icon: 'person' });
        if (next === 'emoji' && value.kind !== 'emoji') onChange({ kind: 'emoji', emoji: '🙂' });
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                    aria-label="Avatar preview"
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '10px',
                        background: avatarBackground(value, false),
                        color: '#ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        flexShrink: 0,
                        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                    }}
                >
                    {avatarContent(value) ?? (initials || 'AB')}
                </Box>
                <Box role="radiogroup" aria-label="Avatar type" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 0.4, borderRadius: '9px', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}>
                    {(
                        [
                            ['icon', 'Icon'],
                            ['initials', 'Initials'],
                            ['emoji', 'Emoji'],
                        ] as const
                    ).map(([k, label]) => (
                        <ButtonBase
                            key={k}
                            role="radio"
                            aria-checked={kind === k}
                            onClick={() => pickKind(k)}
                            sx={{
                                px: 1.25,
                                py: 0.5,
                                borderRadius: '7px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                fontFamily: 'inherit',
                                color: kind === k ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                backgroundColor: kind === k ? 'var(--mui-palette-background-paper)' : 'transparent',
                                border: kind === k ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                                '&:hover': kind === k ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                            }}
                        >
                            {label}
                        </ButtonBase>
                    ))}
                </Box>
            </Box>

            {kind === 'icon' && (
                <Box role="radiogroup" aria-label="Avatar icon" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 0.75 }}>
                    {AVATAR_ICONS.map((key: AvatarIcon) => {
                        const { label, Icon } = AVATAR_ICON_OPTIONS[key];
                        const on = value.kind === 'icon' && value.icon === key;
                        return (
                            <ButtonBase key={key} role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => onChange({ kind: 'icon', icon: key })} sx={tileSx(on)}>
                                <Icon sx={{ fontSize: 22, color: on ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)' }} />
                            </ButtonBase>
                        );
                    })}
                </Box>
            )}

            {kind === 'initials' && (
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Shows the first letters of the drawer title{initials ? `, e.g. ${initials}` : ''}.
                </Typography>
            )}

            {kind === 'emoji' && (
                <Box role="radiogroup" aria-label="Quick emoji" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(38px, 1fr))', gap: 0.5 }}>
                    {QUICK_EMOJI.map((emoji) => {
                        const on = value.kind === 'emoji' && value.emoji === emoji;
                        return (
                            <ButtonBase key={emoji} role="radio" aria-checked={on} aria-label={emoji} onClick={() => onChange({ kind: 'emoji', emoji })} sx={{ ...tileSx(on), width: 'auto', height: 38, fontSize: '1.2rem' }}>
                                {emoji}
                            </ButtonBase>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
