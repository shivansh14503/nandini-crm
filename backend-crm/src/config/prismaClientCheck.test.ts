import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma } from '../generated/prisma/client.js';
import { clientDrift, schemaScalarFields } from './prismaClientCheck.js';

const SCHEMA = `
// A comment line { with braces }
model Lead {
  id        String   @id @default(uuid())
  name      String?  @db.NVarChar(200)
  tags      String[]
  org       Organization? @relation(fields: [orgId], references: [id])
  orgId     String?
  hidden    BigInt   @ignore
  odd       Unsupported("xml")?

  @@index([orgId])
}

model Organization {
  id    String @id
  leads Lead[]
}

enum Status {
  Open
}
`;

describe('schemaScalarFields', () => {
    it('lists scalar fields per model, leaving out relations, @ignore and Unsupported fields', () => {
        const models = schemaScalarFields(SCHEMA);
        assert.deepEqual([...models.keys()], ['Lead', 'Organization']);
        assert.deepEqual([...models.get('Lead')!], ['id', 'name', 'tags', 'orgId']);
        assert.deepEqual([...models.get('Organization')!], ['id']);
    });
});

describe('clientDrift', () => {
    it('names missing models and fields', () => {
        const fields: Record<string, string[]> = { Lead: ['id', 'name', 'tags'] };
        assert.deepEqual(clientDrift(SCHEMA, ['Lead'], (m) => fields[m]), ['Lead.orgId', 'Organization']);
    });
    it('is empty for the generated client and the real schema', () => {
        const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
        const enums = Prisma as unknown as Record<string, Record<string, string> | undefined>;
        const missing = clientDrift(schema, Object.values(Prisma.ModelName), (m) => Object.values(enums[`${m}ScalarFieldEnum`] ?? {}));
        assert.deepEqual(missing, []);
        assert.ok(schemaScalarFields(schema).get('AuditDigest')?.has('blockId'));
    });
});
