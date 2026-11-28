import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailAdminService } from '@/services/emailAdmin.service';
import type { EmailQueueQuery, EmailTemplateContent, EmailTemplateDto, EmailTemplateKey, OutboundEmailDto, SaveOutboundEmailPayload } from '@/types/emailAdmin.types';

export const EMAIL_ADMIN_KEYS = {
    outbound: ['admin-email', 'outbound'] as const,
    templates: ['admin-email', 'templates'] as const,
    queue: (query: EmailQueueQuery) => ['admin-email', 'queue', query] as const,
    queueAll: ['admin-email', 'queue'] as const,
};

export function useOutboundEmail() {
    return useQuery({ queryKey: EMAIL_ADMIN_KEYS.outbound, queryFn: () => emailAdminService.getOutbound() });
}

export function useSaveOutboundEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveOutboundEmailPayload) => emailAdminService.saveOutbound(payload),
        onSuccess: (dto: OutboundEmailDto) => queryClient.setQueryData(EMAIL_ADMIN_KEYS.outbound, dto),
    });
}

export function useCheckOutboundEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => emailAdminService.checkConnection(),
        onSuccess: (result) => queryClient.setQueryData(EMAIL_ADMIN_KEYS.outbound, result.outbound),
    });
}

export function useSendTestEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (to: string) => emailAdminService.sendTest(to),
        onSuccess: (result) => {
            queryClient.setQueryData(EMAIL_ADMIN_KEYS.outbound, result.outbound);
            void queryClient.invalidateQueries({ queryKey: EMAIL_ADMIN_KEYS.queueAll });
        },
    });
}

export function useEmailTemplates() {
    return useQuery({ queryKey: EMAIL_ADMIN_KEYS.templates, queryFn: () => emailAdminService.listTemplates() });
}

const replaceTemplate = (list: EmailTemplateDto[] | undefined, dto: EmailTemplateDto) => (list ?? []).map((t) => (t.key === dto.key ? dto : t));

export function useSaveEmailTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ key, content }: { key: EmailTemplateKey; content: EmailTemplateContent }) => emailAdminService.saveTemplate(key, content),
        onSuccess: (dto) => queryClient.setQueryData<EmailTemplateDto[]>(EMAIL_ADMIN_KEYS.templates, (list) => replaceTemplate(list, dto)),
    });
}

export function useResetEmailTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (key: EmailTemplateKey) => emailAdminService.resetTemplate(key),
        onSuccess: (dto) => queryClient.setQueryData<EmailTemplateDto[]>(EMAIL_ADMIN_KEYS.templates, (list) => replaceTemplate(list, dto)),
    });
}

export function useEmailQueue(query: EmailQueueQuery) {
    return useQuery({
        queryKey: EMAIL_ADMIN_KEYS.queue(query),
        queryFn: () => emailAdminService.listQueue(query),
        placeholderData: keepPreviousData,
        refetchInterval: 30_000,
    });
}

export function useRetryEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => emailAdminService.retry(id),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: EMAIL_ADMIN_KEYS.queueAll });
            void queryClient.invalidateQueries({ queryKey: EMAIL_ADMIN_KEYS.outbound });
        },
    });
}
