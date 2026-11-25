import { Chip, type SxProps, type Theme } from '@mui/material';

/**
 * The "Primary" tag shown next to the primary entry of a list (the primary email address) wherever a record is
 * read: the record's drawer and its full view. Brand tinted, so blue in light mode and green in dark mode.
 */
export function PrimaryTag({ sx }: { sx?: SxProps<Theme> }) {
    return (
        <Chip
            label="Primary"
            size="small"
            sx={[
                {
                    height: 20,
                    flexShrink: 0,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--crm-text-blue-700)',
                    backgroundColor: 'var(--mui-palette-primary-soft)',
                    border: '1px solid var(--mui-palette-primary-softBorder)',
                    '& .MuiChip-label': { px: 0.9 },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        />
    );
}
