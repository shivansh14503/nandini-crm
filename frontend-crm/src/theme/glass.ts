/**
 * Frosted-glass surface shared by the floating navbar and the record dock, so both read as one system.
 * Translucent paper + backdrop blur, token-based so it follows light/dark; solid paper where blur is unsupported.
 */
export const glassSurfaceSx = {
    backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-paper) 72%, transparent)',
    backgroundImage: 'none',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    border: '1px solid color-mix(in srgb, var(--mui-palette-border-main) 85%, transparent)',
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
        backgroundColor: 'var(--mui-palette-background-paper)',
    },
} as const;

/** Resting elevation for floating glass surfaces. */
export const GLASS_SHADOW = '0 12px 32px -14px rgb(15 23 42 / 0.22), 0 2px 6px rgb(15 23 42 / 0.05)';
/** Raised elevation (a surface temporarily floating over content, e.g. a peeking dock). */
export const GLASS_SHADOW_RAISED = '0 24px 48px -16px rgb(15 23 42 / 0.32), 0 4px 12px rgb(15 23 42 / 0.08)';

/** Floating chrome geometry (px): gap to the viewport edges and the navbar height. */
export const FLOAT_INSET = 12;
export const NAVBAR_HEIGHT = 56;
export const GLASS_RADIUS = '18px';
