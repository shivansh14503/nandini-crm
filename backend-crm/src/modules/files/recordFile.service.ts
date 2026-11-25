import { z } from 'zod';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { runInTransaction } from '../shared/transactions.js';
import { detectImageMime } from '../pdf/pdfAsset.service.js';

/**
 * Files uploaded to a record field (an opportunity's Upload Doc). The form uploads the file as soon as it is picked
 * (base64 JSON), keeps the returned id, and the record links it when saved. Content is checked against the declared
 * type by its first bytes.
 */

/** Largest file a record field takes. */
export const RECORD_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const RECORD_FILE_MAX_LABEL = '10 MB';

/** Allowed types, by the signature their content must start with. */
const FILE_FAMILIES = {
    pdf: ['application/pdf'],
    image: ['image/png', 'image/jpeg', 'image/webp'],
    // Office Open XML (zip): .docx, .xlsx
    zip: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    // Legacy Office (OLE compound file): .doc, .xls
    ole: ['application/msword', 'application/vnd.ms-excel'],
} as const;

export const RECORD_FILE_MIME_TYPES = Object.values(FILE_FAMILIES).flat() as [string, ...string[]];

/** Modules whose records take files. */
export const RECORD_FILE_MODULES = ['opportunities'] as const;

const TYPES_MESSAGE = 'Only PDF, image (PNG, JPEG, WebP), Word or Excel files are allowed.';

export const recordFileUploadSchema = z.object({
    module: z.enum(RECORD_FILE_MODULES, { error: `module must be one of: ${RECORD_FILE_MODULES.join(', ')}.` }),
    fileName: z.string({ error: 'File name is required.' }).trim().min(1, { message: 'File name is required.' }).max(200, { message: 'File name cannot exceed 200 characters.' }),
    mimeType: z.enum(RECORD_FILE_MIME_TYPES, { error: TYPES_MESSAGE }),
    /** Base64 (optionally a full data: URI). */
    data: z
        .string({ error: 'File data is required.' })
        .min(4, { message: 'File data is required.' })
        .max(Math.ceil((RECORD_FILE_MAX_BYTES * 4) / 3) + 128, { message: `Files cannot exceed ${RECORD_FILE_MAX_LABEL}.` }),
});

export { RECORD_FILE_SELECT, toRecordFileDto, type RecordFileDto } from './recordFile.dto.js';
import { RECORD_FILE_SELECT, toRecordFileDto, type RecordFileDto } from './recordFile.dto.js';

function familyOf(data: Buffer): keyof typeof FILE_FAMILIES | null {
    if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
    if (detectImageMime(data)) return 'image';
    if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) return 'zip';
    if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'ole';
    return null;
}

function decodeBase64(input: string): Buffer {
    const payload = input.replace(/^data:[\w/+.-]+;base64,/i, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 === 1) {
        throw HttpError.badRequest('File data is not valid base64.', [{ message: 'Invalid file data.', path: ['data'] }]);
    }
    return Buffer.from(payload, 'base64');
}

/** Types shown in the browser (the rest download). */
const INLINE_TYPES: ReadonlySet<string> = new Set([...FILE_FAMILIES.pdf, ...FILE_FAMILIES.image]);

export const recordFileService = {
    async upload(body: unknown, user: AuthUser): Promise<RecordFileDto> {
        const input = recordFileUploadSchema.parse(body);
        const data = decodeBase64(input.data);
        if (data.length === 0) throw HttpError.badRequest('The file is empty.', [{ message: 'The file is empty.', path: ['data'] }]);
        if (data.length > RECORD_FILE_MAX_BYTES) {
            throw HttpError.badRequest(`Files cannot exceed ${RECORD_FILE_MAX_LABEL}.`, [{ message: `Files cannot exceed ${RECORD_FILE_MAX_LABEL}.`, path: ['data'] }]);
        }
        const family = familyOf(data);
        const declaredFamily = (Object.keys(FILE_FAMILIES) as (keyof typeof FILE_FAMILIES)[]).find((f) => (FILE_FAMILIES[f] as readonly string[]).includes(input.mimeType));
        const imageMismatch = family === 'image' && detectImageMime(data) !== input.mimeType;
        if (!family || family !== declaredFamily || imageMismatch) {
            throw HttpError.badRequest("The file's content doesn't match its type. " + TYPES_MESSAGE, [{ message: 'File type does not match its content.', path: ['mimeType'] }]);
        }

        const row = await runInTransaction(async (tx) => {
            const created = await tx.recordFile.create({
                data: { module: input.module, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: data.length, data: new Uint8Array(data), createdBy: user.username },
                select: RECORD_FILE_SELECT,
            });
            await auditService.record(tx, {
                entityType: 'RecordFile',
                entityId: created.id,
                action: 'CREATE',
                changedBy: user.username,
                changes: { module: input.module, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: data.length },
            });
            return created;
        });
        return toRecordFileDto(row);
    },

    async get(id: string): Promise<{ data: Buffer; mimeType: string; fileName: string; inline: boolean }> {
        const row = await prisma.recordFile.findUnique({ where: { id }, select: { data: true, mimeType: true, fileName: true } });
        if (!row) throw HttpError.notFound('File not found');
        return { data: Buffer.from(row.data), mimeType: row.mimeType, fileName: row.fileName, inline: INLINE_TYPES.has(row.mimeType) };
    },
};

/** Rejects a file id that isn't an upload for `module` (a value kept from before, `previousId`, always passes). */
export async function assertRecordFile(tx: TransactionClient, module: (typeof RECORD_FILE_MODULES)[number], id: string | null | undefined, field: string, previousId?: string | null): Promise<void> {
    if (!id || id === previousId) return;
    const row = await tx.recordFile.findUnique({ where: { id }, select: { module: true } });
    if (!row || row.module !== module) {
        throw HttpError.badRequest('The uploaded file was not found. Upload it again.', [{ message: 'The uploaded file was not found. Upload it again.', path: [field] }]);
    }
}
