/**
 * Shared by ThemeRegistry (client) and InitColorSchemeScript (root layout) so the
 * pre-paint script and the runtime provider agree on where the choice is stored.
 */
// Light until users opt in with the navbar toggle. Set to 'system' to follow the OS setting by default.
export const COLOR_SCHEME_DEFAULT_MODE = 'light' as const;
export const COLOR_SCHEME_STORAGE_KEY = 'crm-color-mode';
