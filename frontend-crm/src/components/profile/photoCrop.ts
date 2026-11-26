/**
 * Geometry for the profile photo crop stage. Everything is in "stage units": the square stage is 1 × 1, so the
 * crop survives the stage being resized (phone rotation, dialog width changes).
 *
 * At zoom 1 the image just covers the stage (its shorter side fills it). `offset` is where the image's centre sits
 * relative to the stage's centre.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Output size of the saved photo (px). */
export const OUTPUT_SIZE = 256;

export interface Offset {
    x: number;
    y: number;
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The image's displayed size in stage units. */
export function displaySize(naturalWidth: number, naturalHeight: number, zoom: number): { width: number; height: number } {
    const shorter = Math.min(naturalWidth, naturalHeight) || 1;
    return { width: (zoom * naturalWidth) / shorter, height: (zoom * naturalHeight) / shorter };
}

/** Keeps the image covering the whole stage: it can't be dragged so far that an empty edge shows. */
export function clampOffset(offset: Offset, naturalWidth: number, naturalHeight: number, zoom: number): Offset {
    const { width, height } = displaySize(naturalWidth, naturalHeight, zoom);
    const maxX = Math.max(0, (width - 1) / 2);
    const maxY = Math.max(0, (height - 1) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

/** The square of the source image (natural px) that the stage shows: what gets drawn into the saved photo. */
export function cropRect(naturalWidth: number, naturalHeight: number, zoom: number, offset: Offset): { sx: number; sy: number; size: number } {
    const shorter = Math.min(naturalWidth, naturalHeight) || 1;
    // Natural pixels per stage unit.
    const size = shorter / zoom;
    return {
        sx: naturalWidth / 2 + (-0.5 - offset.x) * size,
        sy: naturalHeight / 2 + (-0.5 - offset.y) * size,
        size,
    };
}
