/**
 * Per-form "preferred phone country". When a user picks a country in one phone field, the other empty phone
 * fields of the same form default to it. Keyed by the react-hook-form `control` object, so forms never share state.
 */
const preferred = new WeakMap<object, string>();
const listeners = new WeakMap<object, Set<() => void>>();

export function getPreferredCountry(form: object | undefined): string | undefined {
    return form ? preferred.get(form) : undefined;
}

export function setPreferredCountry(form: object | undefined, iso2: string): void {
    if (!form || preferred.get(form) === iso2) return;
    preferred.set(form, iso2);
    listeners.get(form)?.forEach((notify) => notify());
}

export function subscribePreferredCountry(form: object | undefined, notify: () => void): () => void {
    if (!form) return () => undefined;
    let set = listeners.get(form);
    if (!set) listeners.set(form, (set = new Set()));
    set.add(notify);
    return () => {
        set.delete(notify);
    };
}
