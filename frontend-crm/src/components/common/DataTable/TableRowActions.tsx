'use client';

import React from 'react';
import Link from 'next/link';
import { Box, IconButton, Tooltip } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';

export interface TableRowActionsProps {
    onView?: () => void;
    onEdit?: () => void;
    /** Renders the view icon as a real link (supports middle/Ctrl/Cmd-click and "open in new tab"). */
    viewHref?: string;
    /** Renders the edit icon as a real link; navigation is native. `onEdit` (if any) still fires as a side-effect hook. */
    editHref?: string;
    onDelete?: () => void;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    children?: React.ReactNode;
    /** Horizontal alignment of the icons within the cell. Defaults to 'center'. */
    align?: 'left' | 'center' | 'right';
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * Standardized Enterprise Table Row Actions Component.
 * Ensures 100% visual and behavioral consistency across all table views in the CRM.
 */
export function TableRowActions({
    onEdit,
    onDelete,
    viewHref,
    editHref,
    viewTooltip = 'View',
    editTooltip = 'Edit',
    deleteTooltip = 'Delete',
    children,
    align = 'center',
}: TableRowActionsProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: JUSTIFY[align],
                gap: 0.5,
                width: '100%',
            }}
        >

            {viewHref && (
                <Tooltip title={viewTooltip}>
                    <IconButton
                        size="small"
                        component={Link}
                        href={viewHref}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        sx={{
                            color: '#64748b',
                            p: 0.5,
                            borderRadius: '6px',
                            '&:hover': { color: '#2563eb', backgroundColor: '#eff6ff' },
                        }}
                    >
                        <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            )}

            {(onEdit || editHref) && (
                <Tooltip title={editTooltip}>
                    <IconButton
                        size="small"
                        {...(editHref ? { component: Link, href: editHref } : {})}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onEdit?.();
                        }}
                        sx={{
                            color: '#64748b',
                            p: 0.5,
                            borderRadius: '6px',
                            '&:hover': { color: '#2563eb', backgroundColor: '#eff6ff' },
                        }}
                    >
                        <EditOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            )}

            {onDelete && (
                <Tooltip title={deleteTooltip}>
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        sx={{
                            color: '#64748b',
                            p: 0.5,
                            borderRadius: '6px',
                            '&:hover': { color: '#dc2626', backgroundColor: '#fef2f2' },
                        }}
                    >
                        <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            )}

            {children}
        </Box>
    );
}
