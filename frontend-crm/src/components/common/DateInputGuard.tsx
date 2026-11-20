'use client';

import { useEffect } from 'react';

/** Last day a date field accepts: also caps the year segment at four digits (browsers allow six by default). */
const MAX_DATE = '9999-12-31';

const isDateInput = (el: EventTarget | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'date';

/** Sets the input's value the way typing would, so React's `onChange` sees it. */
function setNativeValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Keeps every native date field from holding an invalid date, app-wide:
 * - the year can't be typed past four digits;
 * - leaving the field with a date that doesn't exist (`31-02-2026`), a half-typed one (`12-mm-yyyy`), or one
 *   outside the field's `min` / `max` (a past day where only future days are allowed) clears it.
 */
export function DateInputGuard() {
    useEffect(() => {
        const onFocusIn = (e: FocusEvent) => {
            if (isDateInput(e.target) && !e.target.max) e.target.max = MAX_DATE;
        };
        const onFocusOut = (e: FocusEvent) => {
            const input = e.target;
            if (!isDateInput(input) || input.readOnly || input.disabled) return;
            const { badInput, rangeUnderflow, rangeOverflow } = input.validity;
            if (!badInput && !rangeUnderflow && !rangeOverflow) return;
            // A half-typed or impossible date already reads as '', so only the visible segments need clearing.
            if (badInput) input.value = '';
            else setNativeValue(input, '');
        };
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('focusout', onFocusOut, true);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('focusout', onFocusOut, true);
        };
    }, []);
    return null;
}
