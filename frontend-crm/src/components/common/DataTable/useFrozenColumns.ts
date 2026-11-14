'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FrozenColumns {
    /** Callback ref for the header cell of frozen slot `slot` (0 = leftmost). */
    registerHeaderCell: (slot: number) => (el: HTMLElement | null) => void;
    /** Left offset (px) of each frozen slot. */
    lefts: number[];
    /** Total width (px) of the frozen block. */
    frozenWidth: number;
}

/**
 * Left offsets for the first `count` columns of a table, measured from their header cells and kept up to date
 * while they resize (wrapping text, data changes, window resizes). `layoutKey` changes whenever the set of frozen
 * columns changes, so the observer re-attaches to the new cells.
 */
export function useFrozenColumns(count: number, layoutKey: string): FrozenColumns {
    const cells = useRef<(HTMLElement | null)[]>([]);
    const [layout, setLayout] = useState<{ lefts: number[]; width: number }>({ lefts: [], width: 0 });

    const registerHeaderCell = useCallback(
        (slot: number) => (el: HTMLElement | null) => {
            cells.current[slot] = el;
        },
        []
    );

    useEffect(() => {
        if (count === 0) return;
        const measure = () => {
            const lefts: number[] = [];
            let x = 0;
            for (let i = 0; i < count; i++) {
                lefts.push(x);
                x += cells.current[i]?.getBoundingClientRect().width ?? 0;
            }
            setLayout((prev) =>
                prev.width === x && prev.lefts.length === lefts.length && prev.lefts.every((v, i) => v === lefts[i])
                    ? prev
                    : { lefts, width: x }
            );
        };
        // Fires once on observe (initial measurement), then on every size change of a frozen header cell.
        const observer = new ResizeObserver(measure);
        cells.current.slice(0, count).forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, [count, layoutKey]);

    return { registerHeaderCell, lefts: count === 0 ? [] : layout.lefts, frozenWidth: count === 0 ? 0 : layout.width };
}
