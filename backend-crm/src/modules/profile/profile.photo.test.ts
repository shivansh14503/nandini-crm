import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { IMAGE_TOO_LARGE_MESSAGE, INVALID_IMAGE_MESSAGE, preparePhoto } from './profile.photo.js';
import { PHOTO_MAX_BYTES } from './profile.validator.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

function rejects(fn: () => unknown, code: string, message: string) {
    assert.throws(fn, (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, code);
        assert.equal(err.message, message);
        return true;
    });
}

describe('preparePhoto', () => {
    it('accepts PNG, JPEG and WebP as base64 or a data: URI, keeping the detected type', () => {
        assert.equal(preparePhoto({ mimeType: 'image/png', data: PNG.toString('base64') }).mimeType, 'image/png');
        assert.equal(preparePhoto({ mimeType: 'image/jpeg', data: `data:image/jpeg;base64,${JPEG.toString('base64')}` }).mimeType, 'image/jpeg');
        const webp = preparePhoto({ mimeType: 'image/webp', data: WEBP.toString('base64') });
        assert.equal(webp.mimeType, 'image/webp');
        assert.deepEqual(webp.data, WEBP);
        // A browser asked for WebP that encoded PNG: the bytes decide.
        assert.equal(preparePhoto({ mimeType: 'image/webp', data: PNG.toString('base64') }).mimeType, 'image/png');
    });

    it('refuses other declared types and other content (INVALID_IMAGE)', () => {
        rejects(() => preparePhoto({ mimeType: 'image/gif', data: PNG.toString('base64') }), 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE);
        rejects(() => preparePhoto({ mimeType: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }), 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE);
        rejects(() => preparePhoto({ mimeType: 'image/png', data: Buffer.from('GIF89a......').toString('base64') }), 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE);
        rejects(() => preparePhoto({ mimeType: 'image/png', data: 'not base64!' }), 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE);
    });

    it('refuses photos over 512 KB (IMAGE_TOO_LARGE)', () => {
        const big = Buffer.concat([PNG, Buffer.alloc(PHOTO_MAX_BYTES)]);
        rejects(() => preparePhoto({ mimeType: 'image/png', data: big.toString('base64') }), 'IMAGE_TOO_LARGE', IMAGE_TOO_LARGE_MESSAGE);
        const justFits = Buffer.concat([PNG, Buffer.alloc(PHOTO_MAX_BYTES - PNG.length)]);
        assert.equal(preparePhoto({ mimeType: 'image/png', data: `data:image/png;base64,${justFits.toString('base64')}` }).data.length, PHOTO_MAX_BYTES);
    });
});
