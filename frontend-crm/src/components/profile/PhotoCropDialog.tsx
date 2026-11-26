'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Slider, Typography } from '@mui/material';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { PROFILE_PHOTO_INPUT_MAX_BYTES, PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_TYPES } from '@/types/profile.types';
import { MAX_ZOOM, MIN_ZOOM, OUTPUT_SIZE, clampOffset, clampZoom, cropRect, displaySize, type Offset } from './photoCrop';
import { cardButtonLayoutSx, phoneDialogPaperSx, solidButtonSx } from './profileUi';

/** File types the picker offers (the output is always re-encoded). */
export const PHOTO_ACCEPT = PROFILE_PHOTO_TYPES.join(',');

/** Why a picked file can't be used, or null. */
export function photoFileIssue(file: File): string | null {
    if (!(PROFILE_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Choose a PNG, JPEG or WebP image.';
    if (file.size === 0) return 'The file is empty.';
    if (file.size > PROFILE_PHOTO_INPUT_MAX_BYTES) return 'Choose an image of 10 MB or less.';
    return null;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Encodes the canvas as WebP (JPEG where the browser can't write WebP), lowering quality until it fits 512 KB. */
async function encodePhoto(canvas: HTMLCanvasElement): Promise<Blob> {
    for (const type of ['image/webp', 'image/jpeg']) {
        for (const quality of [0.9, 0.8, 0.65, 0.5]) {
            const blob = await toBlob(canvas, type, quality);
            // A browser that can't write the type silently returns PNG: try the next type instead.
            if (!blob || blob.type !== type) break;
            if (blob.size <= PROFILE_PHOTO_MAX_BYTES) return blob;
        }
    }
    throw new Error('Could not prepare the photo. Try a different image.');
}

const PAN_STEP = 0.02;
const PAN_STEP_LARGE = 0.1;
const ZOOM_STEP = 0.1;

interface LoadedImage {
    url: string;
    element: HTMLImageElement;
    width: number;
    height: number;
}

export interface PhotoCropDialogProps {
    open: boolean;
    /** The picked file; "Choose another" inside the dialog replaces it. */
    file: File | null;
    onClose: () => void;
    /** Uploads the cropped 256 × 256 photo; a rejected promise shows its message in the dialog. */
    onSave: (blob: Blob) => Promise<void>;
}

/**
 * Crop a profile photo: the picture sits in a square stage under a circular mask. Drag (mouse, pen or touch) or the
 * arrow keys pan it, the slider / pinch / wheel / + and - keys zoom. "Save photo" draws the visible square into a
 * 256 × 256 image and hands it to `onSave`.
 */
export function PhotoCropDialog({ open, file, onClose, onSave }: PhotoCropDialogProps) {
    const [source, setSource] = useState<File | null>(file);
    const [image, setImage] = useState<LoadedImage | null>(null);
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ distance: number; zoom: number } | null>(null);

    /**
     * Switches to another picture and forgets the previous one, so "Save photo" stays disabled until the new one has
     * loaded (the old decoded picture must never be what gets saved).
     */
    const startOver = (next: File | null) => {
        setSource(next);
        setImage(null);
        setZoom(MIN_ZOOM);
        setOffset({ x: 0, y: 0 });
        setError(null);
    };

    // A new file from the parent starts over (reset during render, not in an effect).
    const [lastFile, setLastFile] = useState<File | null>(file);
    if (file !== lastFile) {
        setLastFile(file);
        startOver(file);
    }

    // Decode the picked file into an <img> (object URL, revoked when replaced or closed).
    useEffect(() => {
        if (!source) return;
        let cancelled = false;
        const url = URL.createObjectURL(source);
        const element = new Image();
        element.onload = () => {
            if (cancelled) return;
            setImage({ url, element, width: element.naturalWidth, height: element.naturalHeight });
            setZoom(MIN_ZOOM);
            setOffset({ x: 0, y: 0 });
            setError(null);
        };
        element.onerror = () => {
            if (cancelled) return;
            setImage(null);
            setError('This image could not be opened. Choose a different PNG, JPEG or WebP file.');
        };
        element.src = url;
        return () => {
            cancelled = true;
            URL.revokeObjectURL(url);
        };
    }, [source]);

    const applyZoom = useCallback(
        (next: number) => {
            if (!image) return;
            const z = clampZoom(next);
            // Zoom about the stage centre: the point under the centre stays put.
            setOffset((o) => clampOffset({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, image.width, image.height, z));
            setZoom(z);
        },
        [image, zoom],
    );

    const pan = useCallback(
        (dx: number, dy: number) => {
            if (!image) return;
            setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, image.width, image.height, zoom));
        },
        [image, zoom],
    );

    // Wheel zoom needs a non-passive listener so the page doesn't scroll under the stage.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || !image) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
    }, [image, zoom, applyZoom]);

    const stageSize = () => stageRef.current?.clientWidth || 1;

    const pinchDistance = () => {
        const [a, b] = [...pointers.current.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!image) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pinch.current = pointers.current.size === 2 ? { distance: pinchDistance(), zoom } : null;
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const previous = pointers.current.get(e.pointerId);
        if (!previous || !image) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2 && pinch.current) {
            const distance = pinchDistance();
            if (pinch.current.distance > 0 && distance > 0) applyZoom((pinch.current.zoom * distance) / pinch.current.distance);
            return;
        }
        const size = stageSize();
        pan((e.clientX - previous.x) / size, (e.clientY - previous.y) / size);
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(e.pointerId);
        pinch.current = pointers.current.size === 2 ? { distance: pinchDistance(), zoom } : null;
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
        const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[e.key]) {
            e.preventDefault();
            // Arrows move the crop window over the picture (ArrowRight shows more of the right side).
            pan(...moves[e.key]);
        } else if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            applyZoom(zoom + ZOOM_STEP);
        } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            applyZoom(zoom - ZOOM_STEP);
        }
    };

    const pickAnother = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        e.target.value = '';
        if (!picked) return;
        const issue = photoFileIssue(picked);
        if (issue) {
            setError(issue);
            return;
        }
        startOver(picked);
    };

    const save = async () => {
        if (!image) return;
        setSaving(true);
        setError(null);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not prepare the photo in this browser.');
            // JPEG has no transparency: transparent pixels would turn black without a backdrop.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const { sx, sy, size } = cropRect(image.width, image.height, zoom, offset);
            ctx.drawImage(image.element, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            await onSave(await encodePhoto(canvas));
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Could not save the photo. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const close = () => {
        if (!saving) onClose();
    };

    const shown = image ? displaySize(image.width, image.height, zoom) : null;

    return (
        <Dialog
            open={open}
            onClose={close}
            maxWidth="xs"
            fullWidth
            aria-labelledby="photo-crop-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle id="photo-crop-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pb: 0.5 }}>
                Profile photo
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Drag to position your photo and use the slider to zoom. The circle shows what others will see.
                </Typography>

                <Box
                    ref={stageRef}
                    role="group"
                    tabIndex={image ? 0 : -1}
                    aria-label="Photo position. Use the arrow keys to move the photo and plus or minus to zoom."
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={onKeyDown}
                    sx={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 320,
                        aspectRatio: '1 / 1',
                        mx: 'auto',
                        overflow: 'hidden',
                        borderRadius: '12px',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                        border: '1px solid var(--mui-palette-border-main)',
                        // Only the stage claims touch gestures; the rest of the dialog still scrolls.
                        touchAction: 'none',
                        userSelect: 'none',
                        cursor: image ? 'grab' : 'default',
                        '&:active': image ? { cursor: 'grabbing' } : undefined,
                        outline: 'none',
                        '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)', borderColor: 'var(--mui-palette-primary-main)' },
                    }}
                >
                    {image && shown ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local object URL being cropped; next/image adds nothing here
                        <img
                            src={image.url}
                            alt=""
                            draggable={false}
                            style={{
                                position: 'absolute',
                                left: `${(0.5 + offset.x) * 100}%`,
                                top: `${(0.5 + offset.y) * 100}%`,
                                width: `${shown.width * 100}%`,
                                height: `${shown.height * 100}%`,
                                maxWidth: 'none',
                                transform: 'translate(-50%, -50%)',
                                pointerEvents: 'none',
                            }}
                        />
                    ) : (
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {source && !error ? <CircularProgress size={28} /> : null}
                        </Box>
                    )}
                    {/* Circular mask: everything outside the circle is dimmed. */}
                    <Box
                        aria-hidden
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            borderRadius: '50%',
                            boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.55)',
                            outline: '2px solid rgb(255 255 255 / 0.85)',
                            outlineOffset: '-2px',
                        }}
                    />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 320, width: '100%', mx: 'auto' }}>
                    <IconButton
                        aria-label="Zoom out"
                        disabled={!image || zoom <= MIN_ZOOM}
                        onClick={() => applyZoom(zoom - ZOOM_STEP * 2)}
                        sx={zoomButtonSx}
                    >
                        <ZoomOutRoundedIcon fontSize="small" />
                    </IconButton>
                    <Slider
                        aria-label="Zoom"
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.01}
                        value={zoom}
                        disabled={!image}
                        onChange={(_, value) => applyZoom(Array.isArray(value) ? value[0] : value)}
                        getAriaValueText={(v) => `${Math.round(v * 100)}%`}
                        sx={{ flex: 1, mx: 0.5, color: 'var(--mui-palette-primary-main)' }}
                    />
                    <IconButton
                        aria-label="Zoom in"
                        disabled={!image || zoom >= MAX_ZOOM}
                        onClick={() => applyZoom(zoom + ZOOM_STEP * 2)}
                        sx={zoomButtonSx}
                    >
                        <ZoomInRoundedIcon fontSize="small" />
                    </IconButton>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}

                <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} hidden onChange={pickAnother} />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
                <Button
                    variant="text"
                    startIcon={<PhotoLibraryOutlinedIcon />}
                    onClick={() => inputRef.current?.click()}
                    disabled={saving}
                    sx={{
                        ...cardButtonLayoutSx,
                        flex: { xs: '1 1 100%', sm: 'none' },
                        mr: { sm: 'auto' },
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        borderRadius: '8px',
                        color: 'var(--crm-text-blue-600)',
                        '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                    }}
                >
                    Choose another
                </Button>
                <Button variant="outlined" onClick={close} disabled={saving} sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={save}
                    disabled={!image || saving}
                    startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                    sx={solidButtonSx}
                >
                    {saving ? 'Saving…' : 'Save photo'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

const zoomButtonSx = {
    width: 40,
    height: 40,
    flexShrink: 0,
    color: 'var(--mui-palette-text-secondary)',
    border: '1px solid var(--mui-palette-border-main)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;
