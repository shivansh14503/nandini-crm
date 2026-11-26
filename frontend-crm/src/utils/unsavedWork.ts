/**
 * App-wide count of screens that hold unsaved edits right now (a dirty form, builder or settings draft). The
 * unsaved-changes guards (`useFormDraftGuard`, `useLeaveGuard`, Document Series) hold a claim while they are active.
 *
 * AuthContext reads it when a request is answered 401 mid-session: with unsaved work on screen it keeps the page
 * mounted and asks the user to sign in again (SessionExpiredDialog) instead of sending them to the login page, which
 * would throw the edits away. No imports, no React: safe to call from anywhere.
 */
let holders = 0;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            // A listener's own failure must not break the guard that called us.
        }
    }
}

/** Marks unsaved work as on screen until the returned release function is called (calling it twice is harmless). */
export function holdUnsavedWork(): () => void {
    holders += 1;
    notify();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holders -= 1;
        notify();
    };
}

/**
 * Calls `listener` whenever the count changes (read `hasUnsavedWork()` inside it). A guard re-running its effect
 * releases and holds again in the same commit, so a listener that acts on "nothing unsaved" should re-check after a
 * tick. Returns the unsubscribe function.
 */
export function subscribeUnsavedWork(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** True while any screen holds unsaved edits. */
export function hasUnsavedWork(): boolean {
    return holders > 0;
}
