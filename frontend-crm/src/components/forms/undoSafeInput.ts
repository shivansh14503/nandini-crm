import { useCallback, useLayoutEffect, useRef } from 'react';

/** Cleans a chunk of text about to be typed / pasted / dropped into an input (e.g. digits only, uppercase). */
export type TextSanitizer = (text: string) => string;

/**
 * Inserts `text` at the caret the way typing does, so it joins the browser's undo stack (Ctrl+Z / Ctrl+Y).
 * Setting `input.value` from script instead wipes that stack, which is why filtered fields couldn't undo.
 */
function insertText(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    // execCommand is deprecated but still the only way to edit an input while keeping native undo.
    if (document.execCommand?.('insertText', false, text)) return;
    // Fallback (no undo entry, but the text still goes in and React is told about it).
    el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Filters typed, pasted and dropped text *before* the browser inserts it, instead of rewriting the input's value
 * afterwards: invalid characters never reach the input, so the value React holds matches the DOM, React never
 * writes to it, and undo / redo keep working. Returns the cleanup.
 */
export function attachUndoSafeSanitizer(el: HTMLInputElement | HTMLTextAreaElement, getSanitizer: () => TextSanitizer | undefined): () => void {
    const replaceWithClean = (e: Event, data: string | null | undefined): void => {
        const sanitize = getSanitizer();
        if (!sanitize || !data) return;
        const clean = sanitize(data);
        if (clean === data) return;
        e.preventDefault();
        if (clean) insertText(el, clean);
    };
    const onBeforeInput = (e: Event) => {
        const event = e as InputEvent;
        // Paste is handled on `paste` (reliable clipboard text); IME composition is left alone.
        if (event.inputType !== 'insertText' && event.inputType !== 'insertReplacementText' && event.inputType !== 'insertFromDrop') return;
        replaceWithClean(e, event.data ?? event.dataTransfer?.getData('text/plain'));
    };
    const onPaste = (e: Event) => replaceWithClean(e, (e as ClipboardEvent).clipboardData?.getData('text/plain'));
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('paste', onPaste);
    return () => {
        el.removeEventListener('beforeinput', onBeforeInput);
        el.removeEventListener('paste', onPaste);
    };
}

/**
 * Stable ref callback for an `<input>` / `<textarea>` applying {@link attachUndoSafeSanitizer} with the latest
 * `sanitize` (undefined = no filtering).
 */
export function useUndoSafeSanitizer(sanitize: TextSanitizer | undefined): (el: HTMLInputElement | HTMLTextAreaElement | null) => void | (() => void) {
    const latest = useRef(sanitize);
    useLayoutEffect(() => {
        latest.current = sanitize;
    });
    return useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
        if (!el) return;
        return attachUndoSafeSanitizer(el, () => latest.current);
    }, []);
}

/** Sets an input's value from script only when it really differs (any write clears the browser's undo stack). */
export function setInputValueIfChanged(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (el.value !== value) el.value = value;
}

export const digitsOnly: TextSanitizer = (text) => text.replace(/\D/g, '');
export const upperCase: TextSanitizer = (text) => text.toUpperCase();
/** Emails: lowercase, no whitespace. */
export const emailText: TextSanitizer = (text) => text.toLowerCase().replace(/\s/g, '');
