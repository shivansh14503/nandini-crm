import jwt from 'jsonwebtoken';

/**
 * id_token claim checks for the Connect callback (Calendar Phase 2 spec §3.3 step 4). The id_token comes straight from
 * the provider's token endpoint over TLS in exchange for our own code + client secret, so (OIDC Core §3.1.3.7) its
 * signature need not be checked again: it is decoded with `jsonwebtoken.decode` and its claims are checked here.
 * Failures carry a fixed callback reason; claim values are never put in messages or logs.
 */

export type IdentityFailure = 'invalid' | 'domain_not_allowed' | 'provider_error';

export class IdentityError extends Error {
    readonly reason: IdentityFailure;
    /** Short fixed name of the failed check (`nonce`, `aud`, `hd_missing`, …), safe to log. */
    readonly check: string;

    constructor(reason: IdentityFailure, check: string) {
        super(`id_token check failed: ${check}`);
        this.name = 'IdentityError';
        this.reason = reason;
        this.check = check;
        Object.setPrototypeOf(this, IdentityError.prototype);
    }
}

export type IdTokenClaims = Record<string, unknown>;

/** Allowed clock skew for `exp` / `iat`. */
export const ID_TOKEN_SKEW_SECONDS = 120;

/** The claims of an id_token (no signature check, see above). */
export function decodeIdToken(idToken: string | undefined): IdTokenClaims {
    if (!idToken) throw new IdentityError('provider_error', 'id_token_missing');
    const decoded = jwt.decode(idToken, { json: true });
    if (!decoded || typeof decoded !== 'object') throw new IdentityError('provider_error', 'id_token_unreadable');
    return decoded as IdTokenClaims;
}

export interface StandardClaimRules {
    issuers: readonly string[];
    audience: string;
    nonce: string;
    now?: Date;
}

const audienceOf = (aud: unknown): string[] => (Array.isArray(aud) ? aud.filter((a): a is string => typeof a === 'string') : typeof aud === 'string' ? [aud] : []);

/** iss ∈ issuers, aud = our client id, not expired (120 s skew), nonce = the one sealed in the cookie. Pure. */
export function checkStandardClaims(claims: IdTokenClaims, rules: StandardClaimRules): void {
    const nowSeconds = Math.floor((rules.now ?? new Date()).getTime() / 1000);
    if (typeof claims.iss !== 'string' || !rules.issuers.includes(claims.iss)) throw new IdentityError('invalid', 'iss');
    if (!audienceOf(claims.aud).includes(rules.audience)) throw new IdentityError('invalid', 'aud');
    if (typeof claims.exp !== 'number' || claims.exp + ID_TOKEN_SKEW_SECONDS < nowSeconds) throw new IdentityError('invalid', 'exp');
    if (typeof claims.nonce !== 'string' || claims.nonce !== rules.nonce) throw new IdentityError('invalid', 'nonce');
}

export const claimString = (claims: IdTokenClaims, key: string): string => (typeof claims[key] === 'string' ? (claims[key] as string) : '');
