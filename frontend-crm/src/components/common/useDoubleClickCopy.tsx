'use client';

import React, { useCallback, useState } from 'react';
import { Portal } from '@mui/material';
import { AppToast } from './AppToast';
import { copyToClipboard } from './Drawer/DrawerPrimitives';

/** Placeholders that mean "no value": nothing worth copying. */
const EMPTY_VALUES = new Set(['', '-', '—', '–']);

/** Copied value as shown in the toast: long values are shortened. */
const toastPreview = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

/**
 * Double-click to select-and-copy: `onDoubleClick` highlights the clicked element's whole text and copies it,
 * and `toast` (render it once, anywhere) confirms with "Copied: …" — shown only after the clipboard accepts
 * the write, so it never claims a copy that failed. Works on https/localhost and on plain http by server IP
 * (legacy copy fallback). If every copy method fails, the text stays selected, so Ctrl+C still works.
 */
export function useDoubleClickCopy() {
    const [copiedText, setCopiedText] = useState<string | null>(null);

    const onDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
        const el = e.currentTarget;
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (EMPTY_VALUES.has(text)) return;

        const range = document.createRange();
        range.selectNodeContents(el);
        const highlight = () => {
            const selection = window.getSelection();
            if (!selection) return;
            selection.removeAllRanges();
            selection.addRange(range);
        };
        highlight();
        void copyToClipboard(text).then((ok) => {
            // The http fallback copies through a hidden textarea, which takes the selection: put it back.
            highlight();
            if (ok) setCopiedText(text);
        });
    }, []);

    // Portalled to <body> so it isn't trapped in a table's or drawer's stacking context (e.g. under the navbar).
    const toast = (
        <Portal>
            <AppToast
                open={copiedText !== null}
                message={copiedText ? `Copied: ${toastPreview(copiedText)}` : ''}
                severity="success"
                autoHideDuration={1500}
                onClose={() => setCopiedText(null)}
            />
        </Portal>
    );

    return { onDoubleClick, toast };
}

/**
 * Inline text that selects-and-copies itself on double-click (e.g. an organization or mailing name in a drawer).
 * Renders a plain span, so it inherits the surrounding typography.
 */
export function DoubleClickCopyText({ children }: { children: React.ReactNode }) {
    const { onDoubleClick, toast } = useDoubleClickCopy();
    return (
        <>
            <span onDoubleClick={onDoubleClick} title="Double-click to copy" style={{ cursor: 'text' }}>
                {children}
            </span>
            {toast}
        </>
    );
}
