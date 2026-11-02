import type { ApiResponse } from '../types/api.types';
import type {
    CreateCategoryPayload,
    CreateFieldPayload,
    CreateOptionPayload,
    CrmModuleKey,
    DropdownCategoryDto,
    DropdownOptionDto,
    FormConfigsPayload,
    FormFieldDefinitionDto,
    ModuleFieldDefault,
    UpdateCategoryPayload,
    UpdateFieldPayload,
    UpdateOptionPayload,
} from '../types/formConfig.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { setFormConfigs } from './masterData.store';

const BASE = '/api/form-configs';
/** Sync entity name: QueryProvider refreshes the form-config queries when it sees it. */
export const FORM_CONFIG_SYNC_ENTITY = 'form-configs';

const enc = encodeURIComponent;

/** Every write broadcasts so open forms, drawers and other tabs pick up the new configuration right away. */
async function mutate<T>(request: Promise<ApiResponse<T>>): Promise<T> {
    const res = await request;
    notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
    return res.data;
}

export const formConfigService = {
    /**
     * The full configuration, archived options and fields included: forms offer only active ones, but archived
     * ones are still needed to label and display values that existing records hold.
     */
    async getAllConfigs(): Promise<FormConfigsPayload> {
        const res = await apiClient.get<ApiResponse<FormConfigsPayload>>(BASE, { params: { includeInactive: true } });
        setFormConfigs(res.data);
        return res.data;
    },

    /** Built-in field defaults of a module (what resetModule restores), used to preview a reset before saving. */
    async getModuleDefaults(module: CrmModuleKey): Promise<ModuleFieldDefault[]> {
        const res = await apiClient.get<ApiResponse<ModuleFieldDefault[]>>(`${BASE}/modules/${enc(module)}/defaults`);
        return res.data;
    },

    // ── Dropdowns ──
    createCategory: (payload: CreateCategoryPayload) => mutate(apiClient.post<ApiResponse<DropdownCategoryDto>>(`${BASE}/categories`, payload)),
    updateCategory: (categoryKey: string, payload: UpdateCategoryPayload) =>
        mutate(apiClient.patch<ApiResponse<DropdownCategoryDto>>(`${BASE}/categories/${enc(categoryKey)}`, payload)),
    addOption: (categoryKey: string, payload: CreateOptionPayload) =>
        mutate(apiClient.post<ApiResponse<DropdownOptionDto>>(`${BASE}/categories/${enc(categoryKey)}/options`, payload)),
    updateOption: (optionId: string, payload: UpdateOptionPayload) =>
        mutate(apiClient.patch<ApiResponse<DropdownOptionDto>>(`${BASE}/options/${enc(optionId)}`, payload)),
    /** Permanent delete of an admin-created dropdown, its options and the custom fields linked to it. */
    deleteCategory: (categoryKey: string) => mutate(apiClient.delete<ApiResponse<{ key: string }>>(`${BASE}/categories/${enc(categoryKey)}`)),
    /** Permanent delete; rejected for system options. (Archive = updateOption({ isActive: false }).) */
    deleteOption: (optionId: string) => mutate(apiClient.delete<ApiResponse<{ id: string }>>(`${BASE}/options/${enc(optionId)}`)),
    reorderOptions: (categoryKey: string, optionIds: string[]) =>
        mutate(apiClient.put<ApiResponse<DropdownCategoryDto>>(`${BASE}/categories/${enc(categoryKey)}/options/reorder`, { optionIds })),

    // ── Fields ──
    createField: (payload: CreateFieldPayload) => mutate(apiClient.post<ApiResponse<FormFieldDefinitionDto>>(`${BASE}/fields`, payload)),
    updateField: (fieldId: string, payload: UpdateFieldPayload) =>
        mutate(apiClient.patch<ApiResponse<FormFieldDefinitionDto>>(`${BASE}/fields/${enc(fieldId)}`, payload)),
    /** Permanent delete of a custom field; rejected for built-in fields. */
    deleteField: (fieldId: string) => mutate(apiClient.delete<ApiResponse<{ id: string }>>(`${BASE}/fields/${enc(fieldId)}`)),
    reorderFields: (module: CrmModuleKey, fieldIds: string[]) =>
        mutate(apiClient.put<ApiResponse<FormFieldDefinitionDto[]>>(`${BASE}/modules/${enc(module)}/fields/reorder`, { fieldIds })),
    renameSection: (module: CrmModuleKey, sectionKey: string, sectionLabel: string) =>
        mutate(apiClient.patch<ApiResponse<FormFieldDefinitionDto[]>>(`${BASE}/modules/${enc(module)}/sections/${enc(sectionKey)}`, { sectionLabel })),
    resetModule: (module: CrmModuleKey) => mutate(apiClient.post<ApiResponse<FormFieldDefinitionDto[]>>(`${BASE}/modules/${enc(module)}/reset`)),
};
