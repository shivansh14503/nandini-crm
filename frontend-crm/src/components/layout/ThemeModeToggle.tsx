'use client';

import { useColorScheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';

/** Navbar Light ↔ Dark switch. MUI saves the choice in localStorage (see theme/colorScheme.ts). */
export function ThemeModeToggle() {
    const { mode, systemMode, setMode } = useColorScheme();

    // `mode` is undefined until the provider reads storage on the client; keep the slot so the navbar doesn't shift.
    if (!mode) return <Box sx={{ width: 36, height: 36, flexShrink: 0 }} />;

    const isDark = (mode === 'system' ? systemMode : mode) === 'dark';
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    const Icon = isDark ? LightModeOutlinedIcon : DarkModeOutlinedIcon;

    return (
        <Tooltip title={label}>
            <Box
                component="button"
                type="button"
                aria-label={label}
                onClick={() => setMode(isDark ? 'light' : 'dark')}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    backgroundColor: 'transparent',
                    color: 'text.secondary',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { backgroundColor: 'background.hover', color: 'text.primary' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                }}
            >
                <Icon sx={{ fontSize: 20 }} />
            </Box>
        </Tooltip>
    );
}
