import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import { EMAIL_LOGGING_SETTING_KEY } from '@/types/emailLog.types';

/**
 * Email logging (Calendar Phase 4). The company switch lives in the `activities` / `emailLogging` module setting
 * (Admin › API Integrations › Email logging), which every signed-in user receives with the form configs, so the
 * record drawers can show or hide their Emails tab without another request.
 */
export function emailLoggingOn(configs: FormConfigsPayload | null | undefined): boolean {
    const raw = configs?.moduleSettings?.activities?.[EMAIL_LOGGING_SETTING_KEY];
    return Boolean(raw && typeof raw === 'object' && (raw as { enabled?: unknown }).enabled === true);
}

export function useEmailLoggingOn(): boolean {
    const configs = useFormConfigs();
    return useMemo(() => emailLoggingOn(configs), [configs]);
}
