'use client';

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import OpenWithRoundedIcon from '@mui/icons-material/OpenWithRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';

/** Floating action bar shown on the selected section / block (drag, move, duplicate, save to library, delete). */

interface Props {
    label: string;
    /** Drag handle wiring from useDraggable (the handle is shown when listeners are given). */
    handleRef?: (node: HTMLElement | null) => void;
    handleListeners?: object;
    handleAttributes?: object;
    onUp?: () => void;
    onDown?: () => void;
    onDuplicate?: () => void;
    onSave?: () => void;
    onDelete?: () => void;
    placement?: 'top' | 'bottom';
}

const btnSx = { width: 26, height: 26, borderRadius: '6px', color: '#1e40af', '&:hover': { backgroundColor: '#dbeafe' } } as const;

function Action({ title, onClick, children, danger }: { title: string; onClick?: () => void; children: React.ReactNode; danger?: boolean }) {
    if (!onClick) return null;
    return (
        <Tooltip title={title} arrow>
            <IconButton
                size="small"
                aria-label={title}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                sx={danger ? { ...btnSx, color: '#dc2626', '&:hover': { backgroundColor: '#fee2e2' } } : btnSx}
            >
                {children}
            </IconButton>
        </Tooltip>
    );
}

export function ElementToolbar({ label, handleRef, handleListeners, handleAttributes, onUp, onDown, onDuplicate, onSave, onDelete, placement = 'top' }: Props) {
    return (
        <Box
            role="toolbar"
            aria-label={`${label} actions`}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            sx={{
                position: 'absolute',
                right: 0,
                ...(placement === 'top' ? { top: 0, transform: 'translateY(calc(-100% - 4px))' } : { bottom: 0, transform: 'translateY(calc(100% + 4px))' }),
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                p: 0.25,
                borderRadius: '8px',
                backgroundColor: '#fff',
                border: '1px solid #bfdbfe',
                boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
                fontFamily: 'inherit',
            }}
        >
            {handleListeners && (
                <Tooltip title="Drag to move" arrow>
                    <Box
                        ref={handleRef}
                        {...handleAttributes}
                        {...handleListeners}
                        aria-label={`Drag ${label}`}
                        sx={{ ...btnSx, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' }}
                    >
                        <OpenWithRoundedIcon sx={{ fontSize: 16 }} />
                    </Box>
                </Tooltip>
            )}
            <Action title="Move up" onClick={onUp}>
                <ArrowUpwardRoundedIcon sx={{ fontSize: 16 }} />
            </Action>
            <Action title="Move down" onClick={onDown}>
                <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} />
            </Action>
            <Action title="Duplicate" onClick={onDuplicate}>
                <ContentCopyOutlinedIcon sx={{ fontSize: 15 }} />
            </Action>
            <Action title="Save to library" onClick={onSave}>
                <BookmarkAddOutlinedIcon sx={{ fontSize: 16 }} />
            </Action>
            <Action title="Delete" onClick={onDelete} danger>
                <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
            </Action>
        </Box>
    );
}

/** Small tab naming the hovered / selected element. */
export function ElementTag({ label, selected }: { label: string; selected: boolean }) {
    return (
        <Box
            sx={{
                position: 'absolute',
                left: -1,
                top: 0,
                transform: 'translateY(-100%)',
                zIndex: 19,
                px: 0.75,
                py: '1px',
                borderRadius: '4px 4px 0 0',
                fontSize: '10px',
                fontWeight: 700,
                lineHeight: 1.5,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
                color: '#fff',
                backgroundColor: selected ? '#2563eb' : '#60a5fa',
                pointerEvents: 'none',
                fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
            }}
        >
            {label}
        </Box>
    );
}
