/** Mirrors backend-crm/src/modules/company-settings (GET / PUT /api/company-settings). */
export interface CompanySettingsDto {
    /** Our company's state (an Indian state or union territory); '' while not set. Decides IGST vs CGST + SGST. */
    companyState: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

export interface SaveCompanySettingsPayload {
    companyState: string;
}
