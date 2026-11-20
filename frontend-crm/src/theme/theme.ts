"use client";

import { createTheme } from '@mui/material/styles';

/*
 * Light and dark color schemes, emitted as CSS variables (`--mui-palette-*`).
 * The active scheme is a class on <html> (`.light` / `.dark`), set before paint by
 * InitColorSchemeScript in the root layout, so there is no flash on load.
 *
 * Use palette paths in `sx` (e.g. `color: 'text.secondary'`, `borderColor: 'border.main'`,
 * `bgcolor: 'error.soft'`) instead of hex literals so components follow the active scheme.
 * In styleOverrides / styled(), read `theme.vars.palette.*` (not `theme.palette.*`, which
 * always holds the light values).
 */

declare module '@mui/material/styles' {
    interface TypeBackground {
        /** Slightly tinted surface: table headers, section bands, input fills. */
        subtle: string;
        /** Row / item hover surface. */
        hover: string;
    }
    interface TypeText {
        /** Tertiary text: placeholders, hints, icons at rest. */
        muted: string;
    }
    interface PaletteBorder {
        light: string;
        main: string;
        strong: string;
    }
    interface Palette {
        border: PaletteBorder;
    }
    interface PaletteOptions {
        border?: Partial<PaletteBorder>;
    }
    interface PaletteColor {
        /** Tinted background for chips, banners and selected states. */
        soft: string;
        /** Border that pairs with `soft`. */
        softBorder: string;
    }
    interface SimplePaletteColorOptions {
        soft?: string;
        softBorder?: string;
    }
}

/** Autofilled inputs keep the field's own surface and text color (see MuiOutlinedInput below). */
const autofillReset = {
    '&:-webkit-autofill': {
        WebkitBoxShadow: 'none',
        WebkitTextFillColor: 'var(--mui-palette-text-primary)',
        caretColor: 'var(--mui-palette-text-primary)',
    },
};

export const theme = createTheme({
    cssVariables: {
        colorSchemeSelector: 'class',
    },
    colorSchemes: {
        light: {
            palette: {
                primary: {
                    main: '#2563EB',
                    light: '#3B82F6',
                    dark: '#1D4ED8',
                    contrastText: '#FFFFFF',
                    soft: '#EFF6FF',
                    softBorder: '#BFDBFE',
                },
                secondary: {
                    main: '#475569',
                    light: '#64748B',
                    dark: '#334155',
                    contrastText: '#FFFFFF',
                    soft: '#F1F5F9',
                    softBorder: '#CBD5E1',
                },
                error: {
                    main: '#DC2626',
                    light: '#EF4444',
                    dark: '#B91C1C',
                    soft: '#FEF2F2',
                    softBorder: '#FECACA',
                },
                warning: {
                    main: '#D97706',
                    light: '#F59E0B',
                    dark: '#B45309',
                    soft: '#FFFBEB',
                    softBorder: '#FDE68A',
                },
                info: {
                    main: '#0284C7',
                    light: '#0EA5E9',
                    dark: '#0369A1',
                    soft: '#F0F9FF',
                    softBorder: '#BAE6FD',
                },
                success: {
                    main: '#16A34A',
                    light: '#22C55E',
                    dark: '#047857',
                    soft: '#ECFDF5',
                    softBorder: '#A7F3D0',
                },
                background: {
                    default: '#EEF2F7',
                    paper: '#FFFFFF',
                    subtle: '#F8FAFC',
                    hover: '#F1F5F9',
                },
                text: {
                    primary: '#1E293B',
                    secondary: '#64748B',
                    muted: '#94A3B8',
                },
                border: {
                    light: '#F1F5F9',
                    main: '#E2E8F0',
                    strong: '#CBD5E1',
                },
                divider: '#E2E8F0',
            },
        },
        dark: {
            palette: {
                // Brand green from the company logo (#7ABD54); high-contrast for text, icons,
                // outlines, switches, and focus states on dark surfaces. Solid buttons use
                // --crm-fill-blue-* so white button labels stay crisp.
                primary: {
                    main: '#7ABD54',
                    light: '#95CC75',
                    dark: '#579638',
                    contrastText: '#FFFFFF',
                    soft: '#162620',
                    softBorder: '#2B4C3B',
                },
                secondary: {
                    main: '#94A3B8',
                    light: '#CBD5E1',
                    dark: '#64748B',
                    contrastText: '#0F172A',
                    soft: '#242E3F',
                    softBorder: '#434E60',
                },
                error: {
                    main: '#F87171',
                    light: '#FCA5A5',
                    dark: '#EF4444',
                    soft: '#2F2331',
                    softBorder: '#632C36',
                },
                warning: {
                    main: '#FBBF24',
                    light: '#FCD34D',
                    dark: '#F59E0B',
                    soft: '#302D2A',
                    softBorder: '#664C21',
                },
                info: {
                    main: '#38BDF8',
                    light: '#7DD3FC',
                    dark: '#0EA5E9',
                    soft: '#142E44',
                    softBorder: '#124F71',
                },
                success: {
                    main: '#4ADE80',
                    light: '#86EFAC',
                    dark: '#22C55E',
                    soft: '#143138',
                    softBorder: '#13564C',
                },
                background: {
                    default: '#0B1120',
                    paper: '#151E2E',
                    subtle: '#1A2436',
                    hover: '#223047',
                },
                text: {
                    primary: '#E2E8F0',
                    secondary: '#94A3B8',
                    muted: '#64748B',
                },
                border: {
                    light: '#1E293B',
                    main: '#2A3649',
                    strong: '#3B4A61',
                },
                divider: '#2A3649',
            },
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
        // Via ModalProps: persistent/permanent drawers render a plain div and would leak a root-level prop to the DOM.
        MuiDrawer: { defaultProps: { ModalProps: { disableScrollLock: true } } },
        MuiMenu: { defaultProps: { disableScrollLock: true } },
        MuiPopover: { defaultProps: { disableScrollLock: true } },
        // Soft/softBorder dark values are opaque blends on paper (same as --crm-*-50 / -200 in color-scale.css).
        // MUI lightens Paper in dark mode with a white overlay per elevation; we use flat surfaces instead.
        MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
        // MUI paints autofilled inputs with an inset blue shadow (#266798) in dark mode. Drop it so
        // the field keeps its own surface; globals.css holds back the browser's native autofill tint.
        MuiOutlinedInput: { styleOverrides: { input: autofillReset } },
        MuiFilledInput: { styleOverrides: { input: autofillReset } },
        MuiButton: {
            styleOverrides: {
                root: ({ theme }) => ({
                    borderRadius: 'var(--crm-radius-button)',
                    boxShadow: 'none',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                    '&:hover': {
                        boxShadow: 'none',
                    },
                    '&.MuiButton-containedPrimary': {
                        color: '#FFFFFF',
                        backgroundColor: 'var(--crm-fill-blue-600)',
                        '&:hover': {
                            backgroundColor: 'var(--crm-fill-blue-700)',
                        },
                    },
                    '&.MuiButton-outlinedPrimary': {
                        borderColor: theme.vars.palette.primary.softBorder,
                        color: 'var(--crm-text-blue-700)',
                        '&:hover': {
                            borderColor: theme.vars.palette.primary.main,
                            backgroundColor: theme.vars.palette.primary.soft,
                        },
                    },
                }),
            },
        },
        MuiCheckbox: {
            styleOverrides: {
                root: ({ theme }) => ({
                    color: theme.vars.palette.text.muted,
                    '&.Mui-checked': {
                        color: theme.vars.palette.primary.main,
                    },
                }),
            },
        },
        MuiRadio: {
            styleOverrides: {
                root: ({ theme }) => ({
                    color: theme.vars.palette.text.muted,
                    '&.Mui-checked': {
                        color: theme.vars.palette.primary.main,
                    },
                }),
            },
        },
        MuiSwitch: {
            styleOverrides: {
                switchBase: {
                    '&.Mui-checked': {
                        color: '#FFFFFF',
                        '& + .MuiSwitch-track': {
                            backgroundColor: 'var(--crm-fill-blue-600)',
                            opacity: 1,
                        },
                    },
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: ({ theme }) => ({
                    transition: 'color 0.15s ease, background-color 0.15s ease',
                    '&:hover:not(.Mui-selected)': {
                        color: theme.vars.palette.primary.main,
                    },
                }),
            },
        },
        MuiCard: {
            styleOverrides: {
                root: ({ theme }) => ({
                    borderRadius: 16,
                    border: `1px solid ${theme.vars.palette.border.main}`,
                }),
            },
        },
    },
});
