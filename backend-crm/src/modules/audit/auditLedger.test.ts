import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { databaseFolder, digestFileName, isVerificationFailure, ledgerTime, parseDigest, sqlError } from './auditLedger.js';

const DIGEST = {
    database_name: 'CRM_DB',
    block_id: 42,
    hash: `0x${'606EDC02470BAB82'.repeat(4)}`,
    last_transaction_commit_time: '2026-11-23T05:32:18.2466667',
    digest_time: '2026-11-23T05:41:02.3412497',
};

describe('parseDigest', () => {
    it('reads the digest SQL Server returns', () => {
        assert.deepEqual(parseDigest(JSON.stringify(DIGEST)), DIGEST);
    });

    it('rejects anything that is not a digest', () => {
        assert.equal(parseDigest(null), null);
        assert.equal(parseDigest(''), null);
        assert.equal(parseDigest('not json'), null);
        assert.equal(parseDigest('[]'), null);
        assert.equal(parseDigest(JSON.stringify({ ...DIGEST, hash: '0x1234' })), null);
        assert.equal(parseDigest(JSON.stringify({ ...DIGEST, block_id: -1 })), null);
        assert.equal(parseDigest(JSON.stringify({ ...DIGEST, block_id: '42' })), null);
        assert.equal(parseDigest(JSON.stringify({ ...DIGEST, database_name: '' })), null);
        assert.equal(parseDigest(JSON.stringify({ ...DIGEST, digest_time: 'yesterday' })), null);
    });

    it('keeps only the digest fields', () => {
        assert.deepEqual(parseDigest(JSON.stringify({ ...DIGEST, extra: 'x' })), DIGEST);
    });
});

describe('ledgerTime', () => {
    it('reads zone-less SQL Server times as UTC', () => {
        assert.equal(ledgerTime('2026-11-23T05:41:02.3412497')?.toISOString(), '2026-11-23T05:41:02.341Z');
        assert.equal(ledgerTime('2026-11-23T05:41:02Z')?.toISOString(), '2026-11-23T05:41:02.000Z');
        assert.equal(ledgerTime('2026-11-23T11:11:02+05:30')?.toISOString(), '2026-11-23T05:41:02.000Z');
        assert.equal(ledgerTime(''), null);
        assert.equal(ledgerTime('nope'), null);
    });
});

describe('digest files', () => {
    it('names a file by digest time and block, sortable and safe on every OS', () => {
        assert.equal(digestFileName(DIGEST), '2026-11-23T054102Z-block-42.json');
    });

    it('makes a database name one safe folder name', () => {
        assert.equal(databaseFolder('CRM_DB'), 'CRM_DB');
        assert.equal(databaseFolder('crm/../db name'), 'crm_.._db_name');
        assert.equal(databaseFolder(''), 'database');
    });
});

describe('verification errors', () => {
    it('treats the ledger verification errors as a failed check, anything else as a check that did not run', () => {
        assert.equal(isVerificationFailure(37392), true);
        assert.equal(isVerificationFailure(37368), true);
        assert.equal(isVerificationFailure(229), false);
        assert.equal(isVerificationFailure(3952), false);
        assert.equal(isVerificationFailure(null), false);
    });

    it('finds the SQL Server error inside a Prisma driver adapter error', () => {
        const err = Object.assign(new Error('Invalid `prisma.$executeRaw()` invocation: Raw query failed.'), {
            code: 'P2010',
            meta: {
                driverAdapterError: Object.assign(new Error('Ledger verification failed.'), {
                    cause: { originalCode: 'EREQUEST', originalMessage: 'Ledger verification failed.', kind: 'mssql', code: 37392 },
                }),
            },
        });
        assert.deepEqual(sqlError(err), { code: 37392, message: 'Ledger verification failed.' });
    });

    it('falls back to the error message when there is no SQL error number', () => {
        assert.deepEqual(sqlError(new Error('EACCES: permission denied,\n  open /digests')), { code: null, message: 'EACCES: permission denied, open /digests' });
        assert.deepEqual(sqlError('boom'), { code: null, message: 'boom' });
    });
});
