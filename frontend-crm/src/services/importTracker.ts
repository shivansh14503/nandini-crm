'use client';

import { useSyncExternalStore } from 'react';
import { ApiClientError } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { importService, type ImportEntity, type ImportJob, type ImportResult } from './import.service';

/**
 * Tracks bulk imports for the whole app, outside any component: the import wizard reads it while open, and when the
 * wizard closes mid-import ("Run in background", Esc, a click outside) the tracker keeps polling, shows the import in
 * the background card (`BackgroundImports`) and, once it finishes, refreshes that module's list (`notifyCrmUpdate`).
 * Before this lived in the wizard, so closing it early stopped the polling and the list never refreshed.
 */

export type TrackedImportPhase = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'lost';

/** A row the wizard didn't send (failed its checks in the preview), kept for the error file. */
export interface SkippedImportRow {
    rowNumber: number;
    errors: string[];
}

/** The uploaded file, kept in memory so failed rows can be downloaded with their original columns. */
export interface ImportSourceFile {
    fileName?: string;
    headers: string[];
    /** File rows by spreadsheet row number (header = 1). */
    rowsByNumber: Map<number, Record<string, string>>;
}

export interface TrackedImport {
    importId: string;
    entity: ImportEntity;
    /** Display name of the records, e.g. "Products". */
    plural: string;
    /** Rows sent to the server. */
    total: number;
    skipped: SkippedImportRow[];
    source?: ImportSourceFile;
    startedAt: number;
    /** When the first row finished (for the time-left estimate). */
    rowsStartedAt?: number;
    phase: TrackedImportPhase;
    processed: number;
    created: number;
    failedCount: number;
    result: ImportResult | null;
    error: string | null;
    cancelling: boolean;
    /** Shown in the background card (the wizard was closed while it ran). */
    background: boolean;
    /** A background import opened again in the full-size dialog (the card's expand button). */
    expanded: boolean;
}

const POLL_MS = 1000;
const MAX_POLL_MS = 5000;
/** Consecutive failed polls before giving up on an import (network blips and restarts are retried). */
const MAX_POLL_ERRORS = 10;
const STORAGE_KEY = 'crm:background-imports';
/** A clean background import leaves the card on its own after this long. */
const AUTO_DISMISS_MS = 10_000;

let imports: TrackedImport[] = [];
const listeners = new Set<() => void>();
const finishedListeners = new Set<(item: TrackedImport) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pollErrors = new Map<string, number>();

const isDone = (phase: TrackedImportPhase) => phase !== 'queued' && phase !== 'running';

function emit() {
    persist();
    listeners.forEach((listener) => listener());
}

function patch(importId: string, changes: Partial<TrackedImport>): TrackedImport | undefined {
    const current = find(importId);
    if (!current) return undefined;
    const updated = { ...current, ...changes };
    // A new list only when something changed, so the snapshot stays the same between updates.
    imports = imports.map((item) => (item === current ? updated : item));
    emit();
    return updated;
}

const find = (importId: string) => imports.find((item) => item.importId === importId);

/** Background imports survive a page reload in this tab: their ids are kept and polling resumes. */
function persist() {
    try {
        const running = imports
            .filter((item) => item.background && !isDone(item.phase))
            .map(({ importId, entity, plural, total, startedAt }) => ({ importId, entity, plural, total, startedAt }));
        if (running.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(running));
        else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage blocked: background imports just don't survive a reload.
    }
}

let restored = false;
function restore() {
    if (restored || typeof window === 'undefined') return;
    restored = true;
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Pick<
            TrackedImport,
            'importId' | 'entity' | 'plural' | 'total' | 'startedAt'
        >[];
        for (const item of saved) {
            if (find(item.importId)) continue;
            imports = [...imports, blank({ ...item, skipped: [], background: true })];
            schedule(item.importId, 0);
        }
        if (saved.length) emit();
    } catch {
        // Nothing to resume.
    }
}

function blank(
    init: Pick<TrackedImport, 'importId' | 'entity' | 'plural' | 'total' | 'skipped' | 'startedAt' | 'background'> & { source?: ImportSourceFile }
): TrackedImport {
    return { ...init, phase: 'queued', processed: 0, created: 0, failedCount: 0, result: null, error: null, cancelling: false, expanded: false };
}

function schedule(importId: string, delay: number) {
    clearTimeout(timers.get(importId));
    timers.set(importId, setTimeout(() => void poll(importId), delay));
}

/** Other lists an import changes: a new quotation moves its opportunity to "Proposal/Price Quote". */
const ALSO_REFRESHES: Partial<Record<string, readonly string[]>> = { quotations: ['/api/opportunities'] };

/** Refreshes the module's lists (and everything that follows them) once the import has written rows. */
function refreshLists(item: TrackedImport) {
    notifyCrmUpdate(`/api/${item.entity}`);
    ALSO_REFRESHES[item.entity]?.forEach((endpoint) => notifyCrmUpdate(endpoint));
}

function finish(importId: string, changes: Partial<TrackedImport>) {
    timers.delete(importId);
    pollErrors.delete(importId);
    const item = patch(importId, changes);
    if (!item) return;
    // "Lost" may still have written rows, so it refreshes too.
    if (item.created > 0 || item.phase === 'lost') refreshLists(item);
    finishedListeners.forEach((listener) => listener(item));
    if (item.background && item.phase === 'completed' && item.failedCount === 0 && item.skipped.length === 0) {
        // Left alone while someone is looking at it in the full-size dialog.
        setTimeout(() => {
            if (!find(importId)?.expanded) dismissImport(importId);
        }, AUTO_DISMISS_MS);
    }
}

function applyJob(importId: string, job: ImportJob) {
    const item = find(importId);
    if (!item) return;
    if (job.state === 'cancelled') {
        finish(importId, { phase: 'cancelled', cancelling: false, processed: 0, created: 0, failedCount: 0 });
        return;
    }
    if (job.state === 'failed') {
        finish(importId, { phase: 'failed', error: job.failedReason || 'The import stopped with an error.' });
        return;
    }
    if (job.state === 'completed' && job.result) {
        fromResult(importId, job.result);
        return;
    }
    const running = job.state === 'active' || job.processed > 0;
    patch(importId, {
        phase: running ? 'running' : 'queued',
        processed: job.processed,
        created: job.created,
        failedCount: job.failedCount,
        cancelling: item.cancelling || job.cancelRequested,
        rowsStartedAt: item.rowsStartedAt ?? (job.processed > 0 ? Date.now() : undefined),
    });
    schedule(importId, POLL_MS);
}

function fromResult(importId: string, result: ImportResult) {
    finish(importId, {
        phase: result.cancelled ? 'cancelled' : 'completed',
        result,
        processed: result.processed ?? result.total,
        created: result.created,
        failedCount: result.failed.length,
        cancelling: false,
    });
}

async function poll(importId: string) {
    if (!find(importId)) return;
    try {
        const job = await importService.job(importId);
        pollErrors.delete(importId);
        applyJob(importId, job);
    } catch (err) {
        const notFound = err instanceof ApiClientError && err.status === 404;
        const errors = (pollErrors.get(importId) ?? 0) + 1;
        pollErrors.set(importId, errors);
        if (notFound || errors >= MAX_POLL_ERRORS) {
            finish(importId, {
                phase: 'lost',
                error: notFound
                    ? 'This import is no longer on the server. Some rows may have been imported; the list has been refreshed.'
                    : 'Lost contact with the server. The import may still finish; the list has been refreshed.',
            });
            return;
        }
        schedule(importId, Math.min(POLL_MS * 2 ** errors, MAX_POLL_MS));
    }
}

export const importTracker = {
    /** Starts tracking a queued import (polls until it ends). */
    track(init: Pick<TrackedImport, 'importId' | 'entity' | 'plural' | 'total' | 'skipped'> & { source?: ImportSourceFile }) {
        imports = [...imports.filter((item) => item.importId !== init.importId), blank({ ...init, startedAt: Date.now(), background: false })];
        emit();
        schedule(init.importId, 0);
    },

    /** Records an import the server ran inside the request (no background queue) and refreshes the list. */
    trackCompleted(
        init: Pick<TrackedImport, 'importId' | 'entity' | 'plural' | 'skipped'> & { source?: ImportSourceFile },
        result: ImportResult
    ) {
        imports = [
            ...imports.filter((item) => item.importId !== init.importId),
            blank({ ...init, total: result.total, startedAt: Date.now(), background: false }),
        ];
        fromResult(init.importId, result);
    },

    async cancel(importId: string) {
        const item = find(importId);
        if (!item || isDone(item.phase) || item.cancelling) return;
        patch(importId, { cancelling: true });
        try {
            applyJob(importId, await importService.cancel(importId));
        } catch (err) {
            patch(importId, { cancelling: false, error: err instanceof Error ? err.message : 'Could not cancel the import.' });
        }
    },

    /**
     * The wizard closed: a running import moves to the background card (and keeps polling); a finished one is
     * forgotten, since the wizard already showed its result.
     */
    release(importId: string) {
        const item = find(importId);
        if (!item) return;
        if (isDone(item.phase)) dismissImport(importId);
        else patch(importId, { background: true });
    },

    dismiss: (importId: string) => dismissImport(importId),

    /** Opens a background import in the full-size dialog again (progress or results, as it stands). */
    expand(importId: string) {
        if (find(importId)?.background) patch(importId, { expanded: true });
    },

    /** Shrinks the full-size dialog of a background import back to its corner card. */
    minimize(importId: string) {
        patch(importId, { expanded: false });
    },
};

function dismissImport(importId: string) {
    clearTimeout(timers.get(importId));
    timers.delete(importId);
    pollErrors.delete(importId);
    const remaining = imports.filter((item) => item.importId !== importId || !isDone(item.phase));
    if (remaining.length === imports.length) return;
    imports = remaining;
    emit();
}

function subscribe(listener: () => void) {
    restore();
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The server render has no imports; one shared empty list so React sees the same snapshot every call. */
const NO_IMPORTS: TrackedImport[] = [];
const getSnapshot = () => imports;
const getServerSnapshot = () => NO_IMPORTS;

export function useTrackedImports(): TrackedImport[] {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useTrackedImport(importId: string | null): TrackedImport | null {
    const all = useTrackedImports();
    return importId ? (all.find((item) => item.importId === importId) ?? null) : null;
}

export const isImportFinished = (item: TrackedImport) => isDone(item.phase);

/**
 * Calls `listener` once each time an import ends (completed, cancelled, failed or lost), whether its wizard is still
 * open or it finished in the background. Returns the unsubscribe function.
 */
export function onImportFinished(listener: (item: TrackedImport) => void): () => void {
    finishedListeners.add(listener);
    return () => finishedListeners.delete(listener);
}
