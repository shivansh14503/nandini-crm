import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env.js';
import { tokenService } from './token.service.js';

const user = { id: 7, username: 'palak', role: 'Sales Executive' };

describe('token must-change-password claim', () => {
    it('carries mcp only when the user must change their password', () => {
        const flagged = tokenService.generateToken(user, { jti: 'j-1', tracked: true, mustChangePassword: true });
        assert.equal((jwt.decode(flagged) as Record<string, unknown>).mcp, true);
        assert.equal(tokenService.verifyToken(flagged).mustChangePassword, true);

        const plain = tokenService.generateToken(user, { jti: 'j-2', tracked: false });
        assert.equal('mcp' in (jwt.decode(plain) as Record<string, unknown>), false);
        assert.equal(tokenService.verifyToken(plain).mustChangePassword, false);
    });

    it('keeps tokens issued before the claim existed valid', () => {
        const old = jwt.sign({ id: 7, username: 'palak', role: 'Admin', tracked: true }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60, jwtid: 'j-3' });
        assert.deepEqual(tokenService.verifyToken(old), { id: 7, username: 'palak', role: 'Admin', jti: 'j-3', tracked: true, mustChangePassword: false });
    });

    it('only a literal true sets it', () => {
        const odd = jwt.sign({ ...user, tracked: true, mcp: 'yes' }, ENV.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60, jwtid: 'j-4' });
        assert.equal(tokenService.verifyToken(odd).mustChangePassword, false);
    });
});
