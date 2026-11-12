import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import type { SavedItemContent } from '@/lib/pdf-document';
import type { PdfModule, PdfTemplate, PdfTemplateCreateInput, PdfTemplateUpdateInput } from '@/types/pdfTemplate.types';
import { queryKeys } from './queryKeys';

const keys = queryKeys.pdfTemplates;
const TEMPLATE_STALE_MS = 60 * 1000;
const FIELDS_STALE_MS = 5 * 60 * 1000;

/** Active templates of a module (inactive ones too when `includeInactive`; honoured for admins only). */
export function usePdfTemplates(params: { module?: PdfModule; includeInactive?: boolean } = {}, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: keys.list({ module: params.module, includeInactive: params.includeInactive ? 'true' : undefined }),
        queryFn: () => pdfTemplateService.list(params),
        staleTime: TEMPLATE_STALE_MS,
        enabled: options.enabled ?? true,
    });
}

export function usePdfTemplate(id: string | undefined) {
    return useQuery({
        queryKey: keys.detail(id ?? ''),
        queryFn: () => pdfTemplateService.get(id as string),
        enabled: Boolean(id),
        staleTime: TEMPLATE_STALE_MS,
    });
}

export function usePdfFields(module: PdfModule) {
    return useQuery({
        queryKey: keys.fields(module),
        queryFn: () => pdfTemplateService.fields(module),
        staleTime: FIELDS_STALE_MS,
    });
}

/** Context the builder canvas renders with: a real quotation when `recordId` is set, else sample data. */
export function usePdfContext(module: PdfModule, recordId: string | undefined) {
    return useQuery({
        queryKey: keys.context(module, recordId ?? ''),
        queryFn: () => pdfTemplateService.context(module, recordId),
        staleTime: TEMPLATE_STALE_MS,
        placeholderData: (previous) => previous,
    });
}

export function usePdfSavedItems(module: PdfModule) {
    return useQuery({ queryKey: keys.saved(module), queryFn: () => pdfTemplateService.savedItems(module), staleTime: TEMPLATE_STALE_MS });
}

export function useSavePdfItem(module: PdfModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ name, content }: { name: string; content: SavedItemContent }) => pdfTemplateService.saveItem(module, name, content),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.saved(module) }),
    });
}

export function useRemovePdfSavedItem(module: PdfModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => pdfTemplateService.removeSavedItem(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.saved(module) }),
    });
}

function useInvalidatePdfTemplates() {
    const queryClient = useQueryClient();
    return (template?: PdfTemplate) => {
        if (template) queryClient.setQueryData(keys.detail(template.id), template);
        return queryClient.invalidateQueries({ queryKey: keys.all });
    };
}

export function useCreatePdfTemplate() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: (input: PdfTemplateCreateInput) => pdfTemplateService.create(input),
        onSuccess: (template) => invalidate(template),
    });
}

export function useUpdatePdfTemplate() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: PdfTemplateUpdateInput }) => pdfTemplateService.update(id, input),
        onSuccess: (template) => invalidate(template),
    });
}

export function useDuplicatePdfTemplate() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name?: string }) => pdfTemplateService.duplicate(id, name),
        onSuccess: (template) => invalidate(template),
    });
}

export function useSetDefaultPdfTemplate() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: (id: string) => pdfTemplateService.setDefault(id),
        onSuccess: () => invalidate(),
    });
}

export function useSetPdfTemplateActive() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => pdfTemplateService.setActive(id, isActive),
        onSuccess: () => invalidate(),
    });
}

export function useDeletePdfTemplate() {
    const invalidate = useInvalidatePdfTemplates();
    return useMutation({
        mutationFn: (id: string) => pdfTemplateService.remove(id),
        onSuccess: () => invalidate(),
    });
}
