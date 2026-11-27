import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailLogService } from '@/services/emailLog.service';
import type { EmailLogModule, EmailLoggingSettings, PersonEmailLogging } from '@/types/emailLog.types';
import { queryKeys } from './queryKeys';

/**
 * Email logging (Calendar Phase 4; docs/api-plan.md › Email logging). Every write broadcasts
 * `notifyCrmUpdate('/api/email-logs')` (services/emailLog.service.ts), which refreshes these queries in every tab.
 */

/** Emails per page on a record's Emails tab. */
export const RECORD_EMAILS_PAGE_SIZE = 20;

/** The emails logged on one record, newest first, a page at a time ("Load more"). */
export function useRecordEmails(module: EmailLogModule, recordId: string, options: { enabled?: boolean } = {}) {
    return useInfiniteQuery({
        queryKey: queryKeys.emailLogs.record(module, recordId),
        queryFn: ({ pageParam }) => emailLogService.forRecord(module, recordId, pageParam, RECORD_EMAILS_PAGE_SIZE),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
        enabled: (options.enabled ?? true) && Boolean(recordId),
        staleTime: 30 * 1000,
    });
}

/** The signed-in employee's own status (My Profile, read-only). */
export function useOwnEmailLogging(options: { enabled?: boolean } = {}) {
    return useQuery({ queryKey: queryKeys.emailLogs.own(), queryFn: emailLogService.own, staleTime: 60 * 1000, enabled: options.enabled ?? true });
}

/** Admins: settings, scopes to add, provider health and counts. */
export function useEmailLoggingOverview(options: { enabled?: boolean } = {}) {
    return useQuery({ queryKey: queryKeys.emailLogs.admin(), queryFn: emailLogService.overview, staleTime: 30 * 1000, enabled: options.enabled ?? true });
}

/** Admins: one person's switch and mailbox status (People dialog). */
export function usePersonEmailLogging(username: string | null | undefined) {
    return useQuery({
        queryKey: queryKeys.emailLogs.person(username ?? ''),
        queryFn: () => emailLogService.person(username!),
        enabled: Boolean(username),
        staleTime: 15 * 1000,
    });
}

function useEmailLogMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.emailLogs.all });
        },
    });
}

export const useSaveEmailLoggingSettings = () => useEmailLogMutation((patch: Partial<EmailLoggingSettings>) => emailLogService.saveSettings(patch));
export const useSetPersonEmailLogging = () =>
    useEmailLogMutation(({ username, mode }: { username: string; mode: PersonEmailLogging['mode'] }) => emailLogService.setPersonMode(username, mode));
export const useRunPersonEmailLogging = () => useEmailLogMutation((username: string) => emailLogService.runPerson(username));
export const usePurgePersonEmails = () => useEmailLogMutation((username: string) => emailLogService.purgePerson(username));
