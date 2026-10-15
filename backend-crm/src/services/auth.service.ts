import { StatusCodes } from 'http-status-codes';
import { poolPromise, sql } from '../config/database.js';
import { tokenService } from './token.service.js';
import { HttpError } from '../middlewares/errorHandler.js';
import type { LoginInput } from '../utils/auth.validator.js';
import type { UserRow, AuthUser } from '../types/user.types.js';

export interface LoginResult {
    user: AuthUser;
    token: string;
}

export const authService = {
    async loginUser(credentials: LoginInput): Promise<LoginResult> {
        const pool = await poolPromise;
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), credentials.username)
            .query<UserRow>(
                'SELECT Id, Username, Password, Role FROM Users WHERE Username = @username',
            );

        const userRow = result.recordset[0];

        if (!userRow) {
            throw new HttpError('Invalid username or password', StatusCodes.UNAUTHORIZED);
        }

        // Plain text password comparison (can be replaced with bcrypt.compare when hashed)
        if (credentials.password !== userRow.Password) {
            throw new HttpError('Invalid username or password', StatusCodes.UNAUTHORIZED);
        }

        const authUser: AuthUser = {
            id: userRow.Id,
            username: userRow.Username,
            role: userRow.Role,
        };

        const token = tokenService.generateToken(authUser);

        return {
            user: authUser,
            token,
        };
    },
};
