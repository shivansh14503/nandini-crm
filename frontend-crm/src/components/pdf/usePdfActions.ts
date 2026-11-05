'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTES } from '@/config/constants';
import { ApiClientError } from '@/services/apiClient';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import type { PdfModule } from '@/types/pdfTemplate.types';

/** Print route per PDF module. */
const PRINT_ROUTES: Record<PdfModule, (id: string, templateId?: string) => string> = {
    QUOTATION: (id, templateId) => ROUTES.QUOTATION_PRINT(id, templateId),
};

const STORAGE_PREFIX = 'pdf-template:';

/** Last template chosen for a module in this browser (per-user convenience; may be unavailable). */
export function readRememberedTemplate(module: PdfModule): string | null {
    try {
        return window.localStorage.getItem(`${STORAGE_PREFIX}${module}`);
    } catch {
        return null;
    }
}

const REMEMBERED_EVENT = 'pdf-template:remembered';

export function rememberTemplate(module: PdfModule, templateId: string): void {
    try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${module}`, templateId);
    } catch {
        // Private mode / blocked storage: nothing to remember.
    }
    window.dispatchEvent(new Event(REMEMBERED_EVENT));
}

/** useSyncExternalStore subscription: this tab's choices and other tabs' (storage events). */
export function subscribeRememberedTemplate(onChange: () => void): () => void {
    const onStorage = (e: StorageEvent) => {
        if (!e.key || e.key.startsWith(STORAGE_PREFIX)) onChange();
    };
    window.addEventListener(REMEMBERED_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(REMEMBERED_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}

export interface PdfToastState {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
}

export type PdfBusyAction = 'download' | 'print' | null;

export const pdfErrorMessage = (err: unknown, fallback = 'Could not generate the PDF. Please try again.'): string =>
    err instanceof ApiClientError || err instanceof Error ? err.message || fallback : fallback;

/** Triggers a browser download of a blob under the server's file name. */
export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Give the browser time to start the download before the URL goes away.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Preview / download / print for one record. Preview opens the print page in a new tab synchronously (so
 * pop-up blockers allow it); download and print fetch the PDF as a blob. Errors are reported through the
 * returned `toast` (render it with AppToast).
 */
export function usePdfActions({ module, recordId }: { module: PdfModule; recordId: string | undefined }) {
    const [busy, setBusy] = useState<PdfBusyAction>(null);
    const [toast, setToast] = useState<PdfToastState>({ open: false, message: '', severity: 'error' });
    const printFrameRef = useRef<HTMLIFrameElement | null>(null);
    const printUrlRef = useRef<string | null>(null);

    const cleanupPrintFrame = useCallback(() => {
        printFrameRef.current?.remove();
        printFrameRef.current = null;
        if (printUrlRef.current) URL.revokeObjectURL(printUrlRef.current);
        printUrlRef.current = null;
    }, []);

    useEffect(() => cleanupPrintFrame, [cleanupPrintFrame]);

    const showError = useCallback((err: unknown) => setToast({ open: true, message: pdfErrorMessage(err), severity: 'error' }), []);
    const closeToast = useCallback(() => setToast((t) => ({ ...t, open: false })), []);

    const preview = useCallback(
        (templateId?: string) => {
            if (!recordId) return;
            const url = PRINT_ROUTES[module](recordId, templateId);
            // No 'noopener' feature string: with it window.open always returns null, so a blocked pop-up would
            // look like "nothing happened". Detach the opener manually instead, and fall back to this tab.
            const tab = window.open(url, '_blank');
            if (tab) {
                try {
                    tab.opener = null;
                } catch {
                    // Cross-origin guard; nothing to detach.
                }
            } else {
                window.location.assign(url);
            }
        },
        [module, recordId],
    );

    const download = useCallback(
        async (templateId?: string) => {
            if (!recordId || busy) return;
            setBusy('download');
            try {
                const { blob, fileName } = await pdfTemplateService.fetchRecordPdf(module, recordId, templateId, 'attachment');
                saveBlob(blob, fileName);
            } catch (err) {
                showError(err);
            } finally {
                setBusy(null);
            }
        },
        [busy, module, recordId, showError],
    );

    const print = useCallback(
        async (templateId?: string) => {
            if (!recordId || busy) return;
            setBusy('print');
            try {
                const { blob } = await pdfTemplateService.fetchRecordPdf(module, recordId, templateId, 'inline');
                cleanupPrintFrame();
                const url = URL.createObjectURL(blob);
                printUrlRef.current = url;
                const frame = document.createElement('iframe');
                frame.setAttribute('aria-hidden', 'true');
                frame.title = 'PDF print frame';
                Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
                printFrameRef.current = frame;
                await new Promise<void>((resolve, reject) => {
                    frame.onload = () => {
                        try {
                            const win = frame.contentWindow;
                            if (!win) throw new Error('Print frame unavailable');
                            win.focus();
                            win.print();
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    };
                    frame.onerror = () => reject(new Error('Print frame failed to load'));
                    frame.src = url;
                    document.body.appendChild(frame);
                });
                // The print dialog is modal in most browsers; keep the frame a while for browsers where it isn't.
                window.setTimeout(cleanupPrintFrame, 60_000);
            } catch (err) {
                cleanupPrintFrame();
                if (err instanceof ApiClientError) {
                    showError(err);
                } else {
                    // Browsers that can't print a PDF iframe (e.g. some Safari versions): open the viewer instead.
                    setToast({ open: true, message: 'Opening the PDF in a new tab to print.', severity: 'info' });
                    preview(templateId);
                }
            } finally {
                setBusy(null);
            }
        },
        [busy, cleanupPrintFrame, module, preview, recordId, showError],
    );

    return { preview, download, print, busy, toast, closeToast };
}
