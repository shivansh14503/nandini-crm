import { useCallback } from 'react';
import type React from 'react';

/** `"padding:1mm 2mm;font-size:9pt"` → `{ padding: '1mm 2mm', fontSize: '9pt' }` (the renderer's inline CSS for React). */
export function cssToStyle(css: string): React.CSSProperties {
    const style: Record<string, string> = {};
    for (const declaration of css.split(';')) {
        const i = declaration.indexOf(':');
        if (i <= 0) continue;
        const prop = declaration.slice(0, i).trim();
        const value = declaration.slice(i + 1).trim();
        if (!prop || !value) continue;
        const key = prop.startsWith('-') ? prop.replace(/^-(\w)/, (_m, c: string) => c.toUpperCase()).replace(/-(\w)/g, (_m, c: string) => c.toUpperCase()) : prop.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
        style[key] = value;
    }
    return style as React.CSSProperties;
}

/** One callback ref feeding several (dnd-kit draggable + droppable on one node). */
export function useMergedRef<T>(a: (node: T | null) => void, b: (node: T | null) => void): (node: T | null) => void {
    return useCallback(
        (node: T | null) => {
            a(node);
            b(node);
        },
        [a, b],
    );
}
