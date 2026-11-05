import { randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { toIso } from '../../utils/mappers.js';
import { runInTransaction } from '../shared/transactions.js';
import { slugify } from './format.js';
import { ASSET_MAX_BYTES, assetUploadSchema } from './pdfTemplate.validator.js';

/**
 * Images embedded in templates (logos). Uploaded as base64 JSON, verified by magic bytes, stored in
 * PdfAsset and resolved to data: URIs at render time. Keys are immutable: a new upload gets a new key, so
 * GET responses can be cached forever and render caches never serve a stale logo.
 */

export interface PdfAssetDto {
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /** API path of the image (`/api/pdf-assets/<key>`). */
    url: string;
    createdAt: string;
}

type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Detects PNG / JPEG / WebP from the first bytes; null for anything else. */
export function detectImageMime(data: Buffer): ImageMime | null {
    if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
    if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

function decodeBase64(input: string): Buffer {
    const payload = input.replace(/^data:[\w/+.-]+;base64,/i, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 === 1) {
        throw HttpError.badRequest('Image data is not valid base64.', [{ message: 'Invalid image data.', path: ['data'] }]);
    }
    return Buffer.from(payload, 'base64');
}

const toDto = (row: { key: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date }): PdfAssetDto => ({
    key: row.key,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: `/api/pdf-assets/${encodeURIComponent(row.key)}`,
    createdAt: toIso(row.createdAt),
});

// Assets never change once uploaded, so their data URIs can be memoised (bounded by count).
const DATA_URI_CACHE_LIMIT = 50;
const dataUriCache = new Map<string, string>();

export const pdfAssetService = {
    async upload(body: unknown, user: AuthUser): Promise<PdfAssetDto> {
        const input = assetUploadSchema.parse(body);
        const data = decodeBase64(input.data);
        if (data.length === 0) throw HttpError.badRequest('The image is empty.');
        if (data.length > ASSET_MAX_BYTES) throw HttpError.badRequest('Images cannot exceed 1 MB.', [{ message: 'Images cannot exceed 1 MB.', path: ['data'] }]);
        const detected = detectImageMime(data);
        if (!detected) throw HttpError.badRequest('Only PNG, JPEG or WebP images are allowed.', [{ message: 'Unsupported image format.', path: ['data'] }]);
        if (detected !== input.mimeType) {
            throw HttpError.badRequest(`The file content is ${detected}, not ${input.mimeType}.`, [{ message: 'File type does not match its content.', path: ['mimeType'] }]);
        }
        const base = slugify(input.fileName.replace(/\.[a-z0-9]+$/i, ''), 40) || 'image';
        const key = input.key ?? `logo-${base}-${randomBytes(3).toString('hex')}`;

        const row = await runInTransaction(async (tx) => {
            const exists = await tx.pdfAsset.findUnique({ where: { key }, select: { id: true } });
            if (exists) throw HttpError.conflict(`An asset with key "${key}" already exists.`, [{ message: 'Key is already in use.', path: ['key'] }]);
            const created = await tx.pdfAsset.create({
                data: { key, fileName: input.fileName, mimeType: detected, sizeBytes: data.length, data: new Uint8Array(data), createdBy: user.username },
                select: { id: true, key: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
            });
            await auditService.record(tx, {
                entityType: 'PdfAsset',
                entityId: created.id,
                action: 'CREATE',
                changedBy: user.username,
                changes: { key, fileName: input.fileName, mimeType: detected, sizeBytes: data.length },
            });
            return created;
        });
        return toDto(row);
    },

    async get(key: string): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
        const row = await prisma.pdfAsset.findUnique({ where: { key }, select: { data: true, mimeType: true, fileName: true } });
        if (!row) throw HttpError.notFound('Asset not found');
        return { data: Buffer.from(row.data), mimeType: row.mimeType, fileName: row.fileName };
    },

    /** Blocked while any non-deleted template references the key (in branding or `{{asset "key"}}`). */
    async remove(key: string, user: AuthUser): Promise<{ key: string }> {
        await runInTransaction(async (tx) => {
            const row = await tx.pdfAsset.findUnique({ where: { key }, select: { id: true, fileName: true } });
            if (!row) throw HttpError.notFound('Asset not found');
            const users = await tx.pdfTemplate.findMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { brandingJson: { contains: `"${key}"` } },
                        { bodyHtml: { contains: key } },
                        { headerHtml: { contains: key } },
                        { footerHtml: { contains: key } },
                        { css: { contains: key } },
                    ],
                },
                select: { name: true },
                take: 5,
            });
            if (users.length) {
                throw HttpError.conflict(`This image is used by: ${users.map((u) => u.name).join(', ')}. Remove it from those templates first.`);
            }
            await tx.pdfAsset.delete({ where: { key } });
            await auditService.record(tx, { entityType: 'PdfAsset', entityId: row.id, action: 'DELETE', changedBy: user.username, changes: { key, fileName: row.fileName } });
        });
        dataUriCache.delete(key);
        return { key };
    },

    /** `{ key: data URI }` for the keys that exist (unknown keys are simply absent). */
    async loadDataUris(keys: readonly string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        const missing: string[] = [];
        for (const key of new Set(keys)) {
            const cached = dataUriCache.get(key);
            if (cached) result[key] = cached;
            else missing.push(key);
        }
        if (missing.length) {
            const rows = await prisma.pdfAsset.findMany({ where: { key: { in: missing } }, select: { key: true, mimeType: true, data: true } });
            for (const row of rows) {
                const uri = `data:${row.mimeType};base64,${Buffer.from(row.data).toString('base64')}`;
                result[row.key] = uri;
                dataUriCache.set(row.key, uri);
                if (dataUriCache.size > DATA_URI_CACHE_LIMIT) {
                    const oldest = dataUriCache.keys().next().value;
                    if (oldest !== undefined) dataUriCache.delete(oldest);
                }
            }
        }
        return result;
    },
};
