'use client';

import { Typography } from '@mui/material';
import { RecordLink } from '../RecordLink';
import type { DataTableColumn } from './types';

export interface DocumentNumberColumnOptions<T> {
    /** Column id: the record's number field (e.g. `leadCode`), also used for sorting. */
    id: string;
    /** Header, e.g. "LEAD NO.". */
    label: string;
    /** The record's document-series number. */
    getNumber: (row: T) => string | null | undefined;
    /** Opens the record, like the name link (Ctrl / middle click opens `getHref` in a new tab). */
    getHref: (row: T) => string;
    onOpen: (row: T) => void;
    locked?: boolean;
}

/**
 * The record's document-series number (Admin › Document Series) as its own table column: monospace, linked
 * to the record. Shared so every module's number column looks and behaves the same.
 */
export function documentNumberColumn<T>({
    id,
    label,
    getNumber,
    getHref,
    onOpen,
    locked,
}: DocumentNumberColumnOptions<T>): DataTableColumn<T> {
    return {
        id,
        label,
        sortable: true,
        locked,
        minWidth: 140,
        render: (row) => {
            const value = getNumber(row);
            if (!value) return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>;
            return (
                <RecordLink
                    href={getHref(row)}
                    onOpen={() => onOpen(row)}
                    sx={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--crm-text-blue-700)',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                >
                    {value}
                </RecordLink>
            );
        },
    };
}
