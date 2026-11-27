import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env.js';
import { tokenService } from './token.service.js';

const user = { id: 7, username: 'palak', role: 'Sales Executive' };

describe('session tokens', () => {
    it('round-trips the user and session', () => {
        const token = tokenService.generateToken(user, { jti: 'j-1', tracked: true });
        assert.equal('mcp' in (jwt.decode(token) as Record<string, unknown>), false);
        assert.deepEqual(tokenService.verifyToken(token), { ...user, jti: 'j-1', tracked: true });
    });

    it('refuses a session opened with a retired temporary password (the mcp claim)', () => {
        for (const mcp of [true, 'yes', false]) {
            const old = jwt.sign({ ...user, tracked: true, mcp }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60, jwtid: 'j-2' });
            assert.throws(() => tokenService.verifyToken(old));
        }
    });

    it('treats a missing tracked flag as untracked', () => {
        const old = jwt.sign({ id: 7, username: 'palak', role: 'Admin' }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60, jwtid: 'j-3' });
        assert.deepEqual(tokenService.verifyToken(old), { id: 7, username: 'palak', role: 'Admin', jti: 'j-3', tracked: false });
    });
});
