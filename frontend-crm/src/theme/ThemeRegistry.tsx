"use client";

import React, { useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';
import { COLOR_SCHEME_DEFAULT_MODE, COLOR_SCHEME_STORAGE_KEY } from './colorScheme';

/**
 * Printing in dark mode would put light text on paper with the (browser-dropped) dark background,
 * so swap <html> to the light scheme for the duration of a print without touching the saved choice.
 */
function usePrintInLightScheme() {
    useEffect(() => {
        const root = document.documentElement;
        let swapped = false;
        const before = () => {
            if (root.classList.contains('dark')) {
                root.classList.replace('dark', 'light');
                swapped = true;
            }
        };
        const after = () => {
            if (swapped) {
                root.classList.replace('light', 'dark');
                swapped = false;
            }
        };
        window.addEventListener('beforeprint', before);
        window.addEventListener('afterprint', after);
        return () => {
            window.removeEventListener('beforeprint', before);
            window.removeEventListener('afterprint', after);
        };
    }, []);
}

export function ThemeRegistry({ children }: { children: React.ReactNode }) {
    usePrintInLightScheme();
    return (
        <ThemeProvider
            theme={theme}
            defaultMode={COLOR_SCHEME_DEFAULT_MODE}
            modeStorageKey={COLOR_SCHEME_STORAGE_KEY}
        >
            <CssBaseline enableColorScheme />
            {children}
        </ThemeProvider>
    );
}
