import { z } from 'zod';

/** PUT /api/company-settings. `companyState`: an Indian state or union territory ('' clears it). */
export const saveCompanySettingsSchema = z.object({
    companyState: z.string({ error: 'Company State must be text.' }).trim().max(80, { message: 'Company State can be at most 80 characters.' }),
});

export type SaveCompanySettingsInput = z.infer<typeof saveCompanySettingsSchema>;
