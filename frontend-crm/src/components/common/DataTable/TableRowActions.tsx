'use client';

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';

export interface TableRowActionsProps {
    onView?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    children?: React.ReactNode;
}

/**
 * Standardized Enterprise Table Row Actions Component.
 * Ensures 100% visual and behavioral consistency across all table views in the CRM.
 */
export function TableRowActions({
    onView,
    onEdit,
    onDelete,
    viewTooltip = 'View Details',
    editTooltip = 'Edit',
    deleteTooltip = 'Delete',
    children,
}: TableRowActionsProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {onView && (
                <Tooltip title={viewTooltip}>
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onView();
                        }}
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

            {onEdit && (
                <Tooltip title={editTooltip}>
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
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
