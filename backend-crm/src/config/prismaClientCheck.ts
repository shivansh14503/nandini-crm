import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Catches a Prisma client generated from an older schema.prisma. The client lives in src/generated (git-ignored) and
 * is rebuilt only by `npm install` / `npm run prisma:generate`, so updating the code and running `db:deploy` alone
 * leaves it behind: new tables then fail at first use with "Cannot read properties of undefined". Checked at start-up
 * (API and worker) so the fix is named up front.
 */

/** Model → scalar field names declared in schema.prisma (relation and `@ignore` fields left out, as in the client). */
export function schemaScalarFields(schema: string): Map<string, Set<string>> {
    const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
    const modelNames = new Set(blocks.map((block) => block[1]));
    const models = new Map<string, Set<string>>();
    for (const [, name, body] of blocks) {
        const fields = new Set<string>();
        for (const line of body.split('\n')) {
            const match = line.trim().match(/^(\w+)\s+(\w+)(\[\])?\??(\s|$)/);
            if (!match || modelNames.has(match[2]) || /@ignore\b/.test(line)) continue;
            fields.add(match[1]);
        }
        models.set(name, fields);
    }
    return models;
}

/** What the schema declares that the client lacks: `Model` for a missing model, `Model.field` for a missing field. */
export function clientDrift(schema: string, clientModels: Iterable<string>, clientFields: (model: string) => Iterable<string> | undefined): string[] {
    const known = new Set(clientModels);
    const missing: string[] = [];
    for (const [model, fields] of schemaScalarFields(schema)) {
        if (!known.has(model)) {
            missing.push(model);
            continue;
        }
        const have = new Set(clientFields(model) ?? []);
        for (const field of fields) if (!have.has(field)) missing.push(`${model}.${field}`);
    }
    return missing;
}

/** Throws when the generated client is older than prisma/schema.prisma; skipped when the schema file isn't deployed. */
export function assertPrismaClientCurrent(): void {
    let schema: string;
    try {
        // Same relative path from src/config and dist/config.
        schema = readFileSync(fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)), 'utf8');
    } catch {
        return;
    }
    const enums = Prisma as unknown as Record<string, Record<string, string> | undefined>;
    const missing = clientDrift(schema, Object.values(Prisma.ModelName), (model) => {
        const fields = enums[`${model}ScalarFieldEnum`];
        return fields ? Object.values(fields) : undefined;
    });
    if (missing.length === 0) return;
    const shown = missing.length > 8 ? `${missing.slice(0, 8).join(', ')} and ${missing.length - 8} more` : missing.join(', ');
    throw new Error(
        `The Prisma client is older than prisma/schema.prisma (missing ${shown}). Run "npm run prisma:generate" in backend-crm, then start again.`
    );
}
