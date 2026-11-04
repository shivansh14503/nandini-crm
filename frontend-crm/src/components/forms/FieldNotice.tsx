import React from 'react';
import { Box } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/** Subtle amber, non-error note under a field (e.g. "Already exists in CRM"). Never marks the field invalid. */
export function FieldNotice({ children }: { children: React.ReactNode }) {
    return (
        <Box
            component="span"
            role="status"
            sx={{
                display: 'inline-flex',
                alignItems: 'flex-start',
                gap: 0.5,
                mt: 0.5,
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                fontSize: '0.72rem',
                lineHeight: 1.4,
                fontWeight: 500,
                color: '#b45309',
                backgroundColor: '#fffbeb',
            }}
        >
            <InfoOutlinedIcon sx={{ fontSize: 14, mt: '1px', flexShrink: 0 }} />
            <span>{children}</span>
        </Box>
    );
}
