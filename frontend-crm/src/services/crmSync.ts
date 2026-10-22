import { useEffect, useRef } from 'react';

/**
 * Global CRM Synchronization Service & Hooks
 *
 * Provides reactive event broadcasting and window/tab focus synchronization
 * across all master views, side drawers, and detail pages in the CRM.
 */

export const CRM_SYNC_EVENT = 'crm:data-updated';
export const CRM_SYNC_CHANNEL_NAME = 'crm_sync_channel';

export interface CrmSyncEventDetail {
    entity?: string;
    id?: string;
    timestamp: number;
}

// Global broadcast channel for immediate multi-tab synchronization
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
        syncChannel = new BroadcastChannel(CRM_SYNC_CHANNEL_NAME);
    } catch {
        syncChannel = null;
    }
}

/**
 * Dispatches a global notification indicating that a CRM record was created,
 * updated, or deleted. Automatically alerts all open drawers, master views,
 * and background tabs.
 */
export function notifyCrmUpdate(entity?: string, id?: string): void {
    if (typeof window === 'undefined') return;

    const detail: CrmSyncEventDetail = {
        entity,
        id,
        timestamp: Date.now(),
    };

    try {
        window.dispatchEvent(new CustomEvent(CRM_SYNC_EVENT, { detail }));
    } catch {
        // Fallback for environments where CustomEvent might fail
    }

    try {
        syncChannel?.postMessage(detail);
    } catch {
        // Fallback if BroadcastChannel was closed or failed
    }
}

/**
 * Subscribes to window focus, document visibility change, cross-tab storage updates,
 * local CRM sync events, and BroadcastChannel messages.
 * Debounces calls to prevent rapid duplicate re-renders.
 */
export function subscribeCrmSync(onSync: () => void, debounceMs = 50): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const triggerSync = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            onSync();
        }, debounceMs);
    };

    const handleFocus = () => {
        triggerSync();
    };

    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            triggerSync();
        }
    };

    const handleStorage = (e: StorageEvent) => {
        // Check for any CRM-related key changes
        if (
            !e.key ||
            e.key.includes('crm') ||
            e.key.includes('org') ||
            e.key.includes('lead') ||
            e.key.includes('opp') ||
            e.key.includes('quote') ||
            e.key.includes('contact') ||
            e.key.includes('product')
        ) {
            triggerSync();
        }
    };

    const handleCustomEvent = () => {
        triggerSync();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(CRM_SYNC_EVENT, handleCustomEvent);

    let channelListener: ((ev: MessageEvent) => void) | null = null;
    if (syncChannel) {
        channelListener = () => triggerSync();
        syncChannel.addEventListener('message', channelListener);
    }

    return () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(CRM_SYNC_EVENT, handleCustomEvent);
        if (syncChannel && channelListener) {
            syncChannel.removeEventListener('message', channelListener);
        }
    };
}

/**
 * React hook that triggers a re-fetch or re-evaluation whenever the browser
 * gains focus, the tab becomes visible, or any CRM entity is updated.
 */
export function useCrmSync(callback: () => void, deps: React.DependencyList = []): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const unsubscribe = subscribeCrmSync(() => {
            callbackRef.current();
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
