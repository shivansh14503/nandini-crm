"use client";

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#1976D2',
            light: '#42A5F5',
            dark: '#1565C0',
            contrastText: '#FFFFFF',
        },
        background: {
            default: '#EEF2F7',
            paper: '#FFFFFF',
        },
        text: {
            primary: '#1E293B',
            secondary: '#64748B',
        },
    },
    typography: {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        button: {
            textTransform: 'none',
            fontWeight: 600,
        },
    },
    shape: {
        borderRadius: 10,
    },
    components: {
        // The page keeps a permanent scrollbar gutter (see globals.css), so MUI's body scroll lock
        // and its compensating padding-right would only add a horizontal jump when overlays open.
        MuiModal: { defaultProps: { disableScrollLock: true } },
        MuiDialog: { defaultProps: { disableScrollLock: true } },
        MuiDrawer: { defaultProps: { disableScrollLock: true } },
        MuiMenu: { defaultProps: { disableScrollLock: true } },
        MuiPopover: { defaultProps: { disableScrollLock: true } },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: 'none',
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 16,
                    border: '1px solid #E8ECF0',
                },
            },
        },
    },
});
