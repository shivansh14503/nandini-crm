import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../../utils/httpError.js';
import { decodeBase64, detectImageMime, type ImageMime } from '../pdf/pdfAsset.service.js';
import { PHOTO_MAX_BASE64_CHARS, PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, PHOTO_MIME_TYPES, type PhotoUploadInput } from './profile.validator.js';

/** Checking an uploaded profile photo (PUT /api/me/photo) before it is stored. No database access. */

export const INVALID_IMAGE_MESSAGE = 'Upload a PNG, JPEG or WebP image.';
export const IMAGE_TOO_LARGE_MESSAGE = `The photo must be ${PHOTO_MAX_LABEL} or smaller.`;

const invalidImage = (path: 'data' | 'mimeType' = 'data') =>
    new HttpError(INVALID_IMAGE_MESSAGE, StatusCodes.BAD_REQUEST, { code: 'INVALID_IMAGE', errors: [{ message: INVALID_IMAGE_MESSAGE, path: [path] }] });

const tooLarge = () =>
    new HttpError(IMAGE_TOO_LARGE_MESSAGE, StatusCodes.BAD_REQUEST, { code: 'IMAGE_TOO_LARGE', errors: [{ message: IMAGE_TOO_LARGE_MESSAGE, path: ['data'] }] });

const isPhotoType = (value: string): value is ImageMime => (PHOTO_MIME_TYPES as readonly string[]).includes(value);

/**
 * The photo's bytes and their real type. The declared `mimeType` must be PNG, JPEG or WebP, and so must the bytes
 * (checked by their signature); the detected type is the one kept, so a browser that encoded a PNG when asked for WebP
 * still works. Throws 400 INVALID_IMAGE or IMAGE_TOO_LARGE.
 */
export function preparePhoto(input: Pick<PhotoUploadInput, 'mimeType' | 'data'>): { data: Buffer; mimeType: ImageMime } {
    if (!isPhotoType(input.mimeType.toLowerCase())) throw invalidImage('mimeType');
    // Size first, before decoding anything big (a data: URI prefix doesn't count).
    if (input.data.replace(/^data:[^,]{0,100},/i, '').length > PHOTO_MAX_BASE64_CHARS) throw tooLarge();

    const data = decodeBase64(input.data, () => invalidImage());
    if (data.length === 0) throw invalidImage();
    if (data.length > PHOTO_MAX_BYTES) throw tooLarge();

    const detected = detectImageMime(data);
    if (!detected) throw invalidImage();
    return { data, mimeType: detected };
}
