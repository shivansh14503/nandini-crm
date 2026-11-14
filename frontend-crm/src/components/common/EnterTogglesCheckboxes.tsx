'use client';

import { useEffect } from 'react';

/**
 * App-wide keyboard rule: Enter on a focused checkbox (MUI Checkbox or Switch, both render
 * `<input type="checkbox">`) toggles it, like Space does. Focus stays on the checkbox, and the Enter never reaches
 * form-submit or dialog "Enter to save" handlers. Mounted once in the root layout; renders nothing.
 */
export function EnterTogglesCheckboxes() {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
            if (target.disabled || target.readOnly || target.getAttribute('aria-readonly') === 'true') return;
            // Capture phase on document runs before React's handlers: stop the Enter here so nothing else acts on it.
            event.preventDefault();
            event.stopPropagation();
            // Holding Enter must not flicker the box on and off.
            if (event.repeat) return;
            // A click runs the same path as Space / mouse: native toggle + React onChange.
            target.click();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, []);

    return null;
}
