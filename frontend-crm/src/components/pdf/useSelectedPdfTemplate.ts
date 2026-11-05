'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { PdfModule, PdfTemplateListItem } from '@/types/pdfTemplate.types';
import { readRememberedTemplate, rememberTemplate, subscribeRememberedTemplate } from './usePdfActions';

/**
 * The template to use for a module: the one picked here, else `explicitId` (e.g. `?templateId=`), else the
 * one remembered in this browser (if still active), else the module default, else the first active one.
 */
export function useSelectedPdfTemplate(module: PdfModule, templates: PdfTemplateListItem[] | undefined, explicitId?: string | null) {
    const [chosenId, setChosenId] = useState<string | null>(null);
    const rememberedId = useSyncExternalStore(
        subscribeRememberedTemplate,
        () => readRememberedTemplate(module),
        () => null,
    );

    const selected = useMemo(() => {
        const list = templates ?? [];
        const find = (id: string | null | undefined) => (id ? list.find((t) => t.id === id) : undefined);
        return find(chosenId) ?? find(explicitId) ?? find(rememberedId) ?? list.find((t) => t.isDefault) ?? list[0];
    }, [chosenId, explicitId, rememberedId, templates]);

    const select = useCallback(
        (id: string) => {
            setChosenId(id);
            rememberTemplate(module, id);
        },
        [module],
    );

    return { selected, select };
}
