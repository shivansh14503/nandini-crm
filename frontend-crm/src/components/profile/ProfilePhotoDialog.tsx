'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { PHOTO_ACCEPT, encodePhoto, photoFileIssue } from './PhotoCropDialog';
import { OUTPUT_SIZE } from './photoCrop';
import { cardButtonLayoutSx, phoneDialogPaperSx, solidButtonSx } from './profileUi';

/** Share of the camera frame's shorter side that the circle covers (and that gets saved). */
const CIRCLE_FRACTION = 0.8;
/** Frame shape shown while the camera is starting (most webcams are 4:3 or 16:9). */
const DEFAULT_ASPECT = 4 / 3;

type CameraMode = 'idle' | 'starting' | 'live' | 'captured' | 'error';

/** A readable reason for a getUserMedia failure. */
function cameraErrorMessage(err: unknown): string {
    const name = err instanceof DOMException || err instanceof Error ? err.name : '';
    switch (name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera access was blocked. Allow the camera for this site in your browser settings (usually the icon in the address bar) and try again.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No camera was found on this device. You can upload a photo from your computer instead.';
        case 'NotReadableError':
        case 'AbortError':
            return 'The camera is being used by another app. Close that app and try again.';
        default:
            return 'The camera could not be started. You can upload a photo from your computer instead.';
    }
}

export interface ProfilePhotoDialogProps {
    open: boolean;
    hasPhoto: boolean;
    onClose: () => void;
    /** A valid image picked from the computer; the parent opens the crop step. */
    onPickFile: (file: File) => void;
    /** Uploads the captured 256 × 256 photo; a rejected promise shows its message in the dialog. */
    onSaveCapture: (blob: Blob) => Promise<void>;
    /** "Remove photo" was chosen; the parent confirms and removes. */
    onRemove: () => void;
}

/**
 * Change the profile photo. The top half takes a photo with the webcam: the full camera view shows with a circular
 * guide (the photo is round everywhere in the CRM), the shutter keeps only the circle's square. The bottom half
 * offers "Upload from computer" (cropped in the same circle afterwards) and "Remove photo".
 */
export function ProfilePhotoDialog({ open, hasPhoto, onClose, onPickFile, onSaveCapture, onRemove }: ProfilePhotoDialogProps) {
    const [mode, setMode] = useState<CameraMode>('idle');
    const [aspect, setAspect] = useState(DEFAULT_ASPECT);
    const [videoReady, setVideoReady] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const captureRef = useRef<HTMLCanvasElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    /** Bumped whenever the camera is stopped, so a getUserMedia that resolves late is thrown away. */
    const sessionRef = useRef(0);

    const stopCamera = () => {
        sessionRef.current += 1;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setVideoReady(false);
    };

    const reset = () => {
        stopCamera();
        setMode('idle');
        setCameraError(null);
        setPreview(null);
        setError(null);
        captureRef.current = null;
    };

    // Leaving the page with the dialog open still turns the camera off.
    useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

    // Hand the stream to the <video> once it is rendered.
    useEffect(() => {
        const video = videoRef.current;
        if (mode !== 'live' || !video || !streamRef.current) return;
        video.srcObject = streamRef.current;
        video.play().catch(() => undefined);
    }, [mode]);

    const startCamera = async () => {
        stopCamera();
        setCameraError(null);
        setError(null);
        setPreview(null);
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraError(
                typeof window !== 'undefined' && !window.isSecureContext
                    ? 'The camera only works when the CRM is opened over a secure (https) connection.'
                    : 'This browser cannot use a camera. You can upload a photo from your computer instead.',
            );
            setMode('error');
            return;
        }
        const session = sessionRef.current;
        setAspect(DEFAULT_ASPECT);
        setMode('starting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            if (session !== sessionRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            setMode('live');
        } catch (err) {
            if (session !== sessionRef.current) return;
            setCameraError(cameraErrorMessage(err));
            setMode('error');
        }
    };

    const onVideoReady = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return;
        setAspect(video.videoWidth / video.videoHeight);
        setVideoReady(true);
    };

    const capture = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return;
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setError('Could not take the photo in this browser.');
            return;
        }
        // The square around the centred circle, mirrored like the preview so the photo matches what the user saw.
        const side = Math.min(video.videoWidth, video.videoHeight) * CIRCLE_FRACTION;
        const sx = (video.videoWidth - side) / 2;
        const sy = (video.videoHeight - side) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.translate(OUTPUT_SIZE, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        captureRef.current = canvas;
        setPreview(canvas.toDataURL('image/png'));
        stopCamera();
        setMode('captured');
    };

    const saveCapture = async () => {
        const canvas = captureRef.current;
        if (!canvas) return;
        setSaving(true);
        setError(null);
        try {
            await onSaveCapture(await encodePhoto(canvas));
            reset();
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Could not save the photo. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const issue = photoFileIssue(file);
        if (issue) {
            setError(issue);
            return;
        }
        reset();
        onPickFile(file);
    };

    /** Every way out of the dialog turns the camera off, so it starts fresh next time. */
    const close = () => {
        if (saving) return;
        reset();
        onClose();
    };

    const remove = () => {
        reset();
        onRemove();
    };

    const cameraOn = mode === 'starting' || mode === 'live';

    return (
        <Dialog
            open={open}
            onClose={close}
            maxWidth="sm"
            fullWidth
            aria-labelledby="profile-photo-title"
            slotProps={{ paper: { sx: phoneDialogPaperSx } }}
        >
            <DialogTitle
                id="profile-photo-title"
                sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pr: 1.5, pb: 1 }}
            >
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                    Profile photo
                </Box>
                <IconButton aria-label="Close" onClick={close} disabled={saving} sx={closeButtonSx}>
                    <CloseRoundedIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '4px !important', pb: 2.5 }}>
                {/* Upper part: the webcam */}
                <Box component="section" aria-label="Take a photo" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
                    {mode === 'idle' && (
                        <ButtonBase focusRipple onClick={startCamera} sx={takePhotoTileSx}>
                            <Box aria-hidden sx={bigIconSx}>
                                <PhotoCameraOutlinedIcon sx={{ fontSize: 30 }} />
                            </Box>
                            <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--crm-slate-900)' }}>
                                Take a photo
                            </Typography>
                            <Typography component="span" sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 340 }}>
                                Use your webcam and line yourself up inside the circle.
                            </Typography>
                        </ButtonBase>
                    )}

                    {cameraOn && (
                        <>
                            <Typography sx={hintSx}>Place your face inside the circle, then press the shutter.</Typography>
                            <Box
                                sx={{
                                    position: 'relative',
                                    // The whole camera frame shows; on short screens it shrinks to keep the buttons in view.
                                    width: `min(100%, calc(52vh * ${aspect}))`,
                                    aspectRatio: `${aspect}`,
                                    mx: 'auto',
                                    overflow: 'hidden',
                                    borderRadius: '12px',
                                    backgroundColor: 'var(--mui-palette-background-subtle)',
                                    border: '1px solid var(--mui-palette-border-main)',
                                }}
                            >
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    onLoadedMetadata={onVideoReady}
                                    onResize={onVideoReady}
                                    aria-label="Camera preview"
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        // Mirror like a selfie camera so moving left moves left on screen.
                                        transform: 'scaleX(-1)',
                                        opacity: videoReady ? 1 : 0,
                                    }}
                                />
                                {!videoReady && (
                                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                                        <CircularProgress size={28} />
                                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Starting camera…</Typography>
                                    </Box>
                                )}
                                {/* Circular guide: everything outside it is dimmed. */}
                                <Box
                                    aria-hidden
                                    sx={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        ...(aspect >= 1
                                            ? { height: `${CIRCLE_FRACTION * 100}%`, width: 'auto' }
                                            : { width: `${CIRCLE_FRACTION * 100}%`, height: 'auto' }),
                                        aspectRatio: '1 / 1',
                                        borderRadius: '50%',
                                        pointerEvents: 'none',
                                        boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.55)',
                                        outline: '2px dashed rgb(255 255 255 / 0.9)',
                                        outlineOffset: '-2px',
                                        opacity: videoReady ? 1 : 0,
                                    }}
                                />
                            </Box>
                            <Box sx={actionRowSx}>
                                <Button variant="outlined" onClick={reset} sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={capture}
                                    disabled={!videoReady}
                                    startIcon={<CameraAltRoundedIcon />}
                                    sx={solidButtonSx}
                                >
                                    Take photo
                                </Button>
                            </Box>
                        </>
                    )}

                    {mode === 'captured' && preview && (
                        <>
                            <Typography sx={hintSx}>This is how your photo will look.</Typography>
                            <Box
                                sx={{
                                    width: { xs: 180, sm: 220 },
                                    maxWidth: '70%',
                                    aspectRatio: '1 / 1',
                                    mx: 'auto',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    border: '3px solid var(--mui-palette-background-paper)',
                                    boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.22)',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL of the captured frame */}
                                <img src={preview} alt="Captured photo" style={{ width: '100%', height: '100%', display: 'block' }} />
                            </Box>
                            <Box sx={actionRowSx}>
                                <Button
                                    variant="outlined"
                                    onClick={startCamera}
                                    disabled={saving}
                                    startIcon={<ReplayRoundedIcon />}
                                    sx={{ ...secondaryButtonSx, ...cardButtonLayoutSx }}
                                >
                                    Retake
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={saveCapture}
                                    disabled={saving}
                                    startIcon={saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
                                    sx={solidButtonSx}
                                >
                                    {saving ? 'Saving…' : 'Use this photo'}
                                </Button>
                            </Box>
                        </>
                    )}

                    {mode === 'error' && (
                        <Box sx={{ ...takePhotoTileSx, cursor: 'default', borderStyle: 'solid' }}>
                            <Box aria-hidden sx={{ ...bigIconSx, color: 'var(--mui-palette-text-muted)', backgroundColor: 'var(--mui-palette-background-hover)', borderColor: 'var(--mui-palette-border-main)' }}>
                                <VideocamOffOutlinedIcon sx={{ fontSize: 28 }} />
                            </Box>
                            <Typography role="alert" sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 380 }}>
                                {cameraError}
                            </Typography>
                            <Button variant="outlined" onClick={startCamera} startIcon={<ReplayRoundedIcon />} sx={{ ...secondaryButtonSx, minHeight: 40 }}>
                                Try again
                            </Button>
                        </Box>
                    )}
                </Box>

                {error && (
                    <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}

                {/* Divider */}
                <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'var(--mui-palette-text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>
                    <Box sx={{ flex: 1, height: '1px', backgroundColor: 'var(--mui-palette-border-main)' }} />
                    OR
                    <Box sx={{ flex: 1, height: '1px', backgroundColor: 'var(--mui-palette-border-main)' }} />
                </Box>

                {/* Bottom part: other options */}
                <Box component="section" aria-label="Other options" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <OptionButton
                        icon={<UploadFileOutlinedIcon fontSize="small" />}
                        title="Upload from computer"
                        hint="PNG, JPEG or WebP up to 10 MB. You can position it in the circle next."
                        disabled={saving}
                        onClick={() => inputRef.current?.click()}
                    />
                    {hasPhoto && (
                        <OptionButton
                            icon={<DeleteOutlineRoundedIcon fontSize="small" />}
                            title="Remove photo"
                            hint="Show your initials instead."
                            danger
                            disabled={saving}
                            onClick={remove}
                        />
                    )}
                    <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} hidden onChange={onFilePicked} />
                </Box>
            </DialogContent>
        </Dialog>
    );
}

function OptionButton({
    icon,
    title,
    hint,
    danger,
    disabled,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    hint: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <ButtonBase
            focusRipple
            disabled={disabled}
            onClick={onClick}
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 1.5,
                width: '100%',
                minHeight: 56,
                px: 1.5,
                py: 1.25,
                textAlign: 'left',
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                transition: 'all 0.15s ease',
                '& .option-icon': {
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    border: '1px solid var(--mui-palette-border-main)',
                    color: 'var(--mui-palette-text-secondary)',
                },
                '&:hover, &.Mui-focusVisible': danger
                    ? {
                          borderColor: 'var(--mui-palette-error-softBorder)',
                          backgroundColor: 'var(--mui-palette-error-soft)',
                          '& .option-title, & .option-icon': { color: 'var(--mui-palette-error-main)' },
                      }
                    : {
                          borderColor: 'var(--crm-blue-300)',
                          backgroundColor: 'var(--mui-palette-primary-soft)',
                          '& .option-title, & .option-icon': { color: 'var(--crm-text-blue-700)' },
                      },
                '&.Mui-disabled': { opacity: 0.6 },
            }}
        >
            <Box
                aria-hidden
                className="option-icon"
                sx={{ width: 36, height: 36, borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s ease' }}
            >
                {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography component="span" className="option-title" sx={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: 'var(--crm-slate-900)' }}>
                    {title}
                </Typography>
                <Typography component="span" sx={{ display: 'block', fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                    {hint}
                </Typography>
            </Box>
        </ButtonBase>
    );
}

const hintSx = { fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', textAlign: 'center' } as const;

const actionRowSx = { display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' } as const;

const takePhotoTileSx = {
    width: '100%',
    minHeight: { xs: 170, sm: 210 },
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    px: 2,
    py: 3,
    textAlign: 'center',
    borderRadius: '12px',
    border: '2px dashed var(--mui-palette-border-strong)',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    transition: 'all 0.15s ease',
    '&:hover, &.Mui-focusVisible': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
    },
} as const;

const bigIconSx = {
    width: 60,
    height: 60,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--crm-text-blue-600)',
    backgroundColor: 'var(--mui-palette-primary-soft)',
    border: '1px solid var(--mui-palette-primary-softBorder)',
} as const;

const closeButtonSx = {
    width: 36,
    height: 36,
    color: 'var(--mui-palette-text-secondary)',
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
    },
} as const;
