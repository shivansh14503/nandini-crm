'use client';

import { useCallback, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { AutocompleteHighlightChangeReason, AutocompleteInputChangeReason } from '@mui/material';

export interface TabSelectOptions {
    /**
     * Field that also accepts typed text (MUI `freeSolo`). Then nothing is pre-highlighted and Tab only picks an
     * option the user moved to with the arrow keys; otherwise Tab keeps the typed text.
     */
    freeText?: boolean;
    /** Option labels Tab never picks (e.g. a "Not listed" escape option). */
    skipLabels?: readonly string[];
    /**
     * Multi-selects: a Tab that picks an option keeps focus in the field, so the user can type the next one.
     * A Tab with nothing typed still moves on to the next field.
     */
    stayAfterPick?: boolean;
    /** The field's own handlers, called first (the returned props replace them on the Autocomplete). */
    onInputChange?: (event: SyntheticEvent, value: string, reason: AutocompleteInputChangeReason) => void;
    onClose?: (event: SyntheticEvent, reason: string) => void;
}

/**
 * Tab (or Shift+Tab) in an open Autocomplete picks the highlighted option and still moves focus on, like
 * spreadsheet autocomplete. Only after the user typed, so tabbing through a form never fills anything in.
 *
 * Spread the result onto an MUI `<Autocomplete>`. The highlighted option is read from the input's
 * `aria-activedescendant` and clicked, so MUI's own selection logic (value mapping, multiple, onChange) runs.
 */
export function useTabSelect({ freeText = false, skipLabels, stayAfterPick = false, onInputChange, onClose }: TabSelectOptions = {}) {
    const typed = useRef(false);
    const keyboardHighlight = useRef(false);

    const handleInputChange = useCallback(
        (event: SyntheticEvent, value: string, reason: AutocompleteInputChangeReason) => {
            onInputChange?.(event, value, reason);
            if (reason === 'input') {
                typed.current = value.trim() !== '';
                keyboardHighlight.current = false;
            }
        },
        [onInputChange]
    );

    const handleHighlightChange = useCallback(
        (_event: SyntheticEvent | null, option: unknown, reason: AutocompleteHighlightChangeReason) => {
            keyboardHighlight.current = reason === 'keyboard' && option != null;
        },
        []
    );

    const handleClose = useCallback(
        (event: SyntheticEvent, reason: string) => {
            onClose?.(event, reason);
            typed.current = false;
            keyboardHighlight.current = false;
        },
        [onClose]
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Tab' || event.nativeEvent.isComposing) return;
            if (!typed.current || (freeText && !keyboardHighlight.current)) return;
            const input = event.target;
            if (!(input instanceof HTMLInputElement)) return;
            const activeId = input.getAttribute('aria-activedescendant');
            const option = activeId ? document.getElementById(activeId) : null;
            if (!option || option.getAttribute('aria-disabled') === 'true') return;
            // Already chosen: clicking would de-select it in a multi-select (and is a no-op in a single one).
            if (option.getAttribute('aria-selected') === 'true') return;
            if (skipLabels?.includes(option.textContent?.trim() ?? '')) return;
            typed.current = false;
            // Single-selects: no preventDefault, so the Tab still moves focus to the next field.
            if (stayAfterPick) event.preventDefault();
            option.click();
        },
        [freeText, skipLabels, stayAfterPick]
    );

    return {
        autoHighlight: !freeText,
        onInputChange: handleInputChange,
        onHighlightChange: handleHighlightChange,
        onClose: handleClose,
        onKeyDown: handleKeyDown,
    };
}
