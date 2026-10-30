const FOCUSABLE =
    'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, select, [role="combobox"], [tabindex="0"]';

function findFieldElement(fieldName: string): HTMLElement | null {
    const key = CSS.escape(fieldName);
    // `data-field` wrappers (FormField) first, then native name/id/test-id hooks.
    const selectors = [
        `[data-field="${key}"]`,
        `input[name="${key}"]`,
        `textarea[name="${key}"]`,
        `select[name="${key}"]`,
        `[name="${key}"]`,
        `#${key}`,
        `[data-testid="${key}"]`,
    ];
    for (const selector of selectors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) return el;
    }
    return null;
}

function resolveFocusTarget(el: HTMLElement): HTMLElement {
    // MUI Select renders a hidden native input; the interactive element is the sibling combobox.
    if (el.classList.contains('MuiSelect-nativeInput')) {
        const combobox = el.parentElement?.querySelector<HTMLElement>('[role="combobox"]');
        if (combobox) return combobox;
    }
    if (el.matches(FOCUSABLE)) return el;
    const phoneInput = el.querySelector<HTMLElement>('[data-phone-national]');
    if (phoneInput) return phoneInput;
    return el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
}

const BLUE = '37, 99, 235';
const activeGlows = new WeakMap<Element, Animation[]>();

/**
 * Plays a blue attention pulse on the field's visual container.
 * Uses the Web Animations API rather than a CSS class: React/MUI rewrite the element's className
 * when the field gains focus (Mui-focused), which would wipe a manually added class instantly.
 */
function glowField(target: HTMLElement): void {
    const visual =
        target.closest<HTMLElement>('.MuiOutlinedInput-root') ??
        target.closest<HTMLElement>('.MuiFormControl-root') ??
        target.parentElement ??
        target;
    if (typeof visual.animate !== 'function') return;

    activeGlows.get(visual)?.forEach((a) => a.cancel());

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timing: KeyframeAnimationOptions = {
        duration: reduceMotion ? 1200 : 1800,
        delay: reduceMotion ? 0 : 250, // let the smooth scroll arrive first
        easing: 'ease-out',
        fill: 'backwards',
    };

    const ring: Keyframe[] = reduceMotion
        ? [{ boxShadow: `0 0 0 4px rgba(${BLUE}, 0.35)` }, { boxShadow: `0 0 0 0 rgba(${BLUE}, 0)` }]
        : [
              { boxShadow: `0 0 0 0 rgba(${BLUE}, 0.75), 0 0 0 rgba(${BLUE}, 0)`, backgroundColor: `rgba(${BLUE}, 0.10)`, transform: 'scale(1)', offset: 0 },
              { boxShadow: `0 0 0 7px rgba(${BLUE}, 0.30), 0 0 22px rgba(${BLUE}, 0.55)`, backgroundColor: `rgba(${BLUE}, 0.08)`, transform: 'scale(1.012)', offset: 0.18 },
              { boxShadow: `0 0 0 2px rgba(${BLUE}, 0.20), 0 0 8px rgba(${BLUE}, 0.20)`, backgroundColor: `rgba(${BLUE}, 0.05)`, transform: 'scale(1)', offset: 0.38 },
              { boxShadow: `0 0 0 9px rgba(${BLUE}, 0.26), 0 0 26px rgba(${BLUE}, 0.5)`, backgroundColor: `rgba(${BLUE}, 0.07)`, transform: 'scale(1.01)', offset: 0.58 },
              { boxShadow: `0 0 0 0 rgba(${BLUE}, 0), 0 0 0 rgba(${BLUE}, 0)`, backgroundColor: `rgba(${BLUE}, 0)`, transform: 'scale(1)', offset: 1 },
          ];

    const animations: Animation[] = [visual.animate(ring, timing)];

    // Keep the outline crisp blue while the glow is visible.
    const outline = visual.querySelector<HTMLElement>('fieldset');
    if (outline) {
        animations.push(
            outline.animate(
                [
                    { borderColor: '#2563eb', borderWidth: '2px', offset: 0 },
                    { borderColor: '#1d4ed8', borderWidth: '2px', offset: 0.6 },
                    { borderColor: '#2563eb', borderWidth: '1.5px', offset: 1 },
                ],
                timing
            )
        );
    }

    activeGlows.set(visual, animations);
}

/**
 * Smoothly scrolls to and focuses a form field by its field key (RHF `name`, `data-field`, id or test id).
 * Handles MUI text fields, selects and textareas. Returns false when the field isn't mounted.
 */
export function focusFormField(fieldName: string): boolean {
    if (!fieldName || typeof document === 'undefined') return false;

    const el = findFieldElement(fieldName);
    if (!el) return false;

    const target = resolveFocusTarget(el);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    // preventScroll avoids a second jump fighting the smooth scroll above.
    target.focus({ preventScroll: true });
    glowField(target);
    return true;
}
