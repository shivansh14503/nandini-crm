/** Roles allowed to manage forms, dropdowns and PDF templates (mirrors FORM_CONFIG_ADMIN_ROLES on the API). */
export const ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'administrator', 'super admin']);

export const isAdminRole = (role: string | null | undefined): boolean => ADMIN_ROLES.has((role ?? '').toLowerCase());
