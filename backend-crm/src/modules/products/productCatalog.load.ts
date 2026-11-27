import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { cacheService } from '../../services/cache.service.js';
import { SYSTEM_USER } from '../audit/auditUsers.js';
import { afterManufacturersAdded } from './product.manufacturer.js';
import { createProductRecord } from './product.service.js';
import { productInputSchema } from './product.validator.js';
import { PRODUCT_CATALOG_SHEET } from './productCatalog.data.js';

/**
 * Marks the sheet as loaded (a `ModuleSetting` outside the CRM modules, so it never reaches the form configuration):
 * products an admin deletes afterwards don't come back on the next start-up.
 */
const MARKER = { module: 'system', key: 'productCatalogSheetLoaded' } as const;

/**
 * Loads the Product Catalog sheet (productCatalog.data.ts) into the catalog once: every product whose name isn't
 * already a live product's is created as the `system` user (numbered, audited, its new manufacturer added to the
 * Manufacturer dropdown). Run at start-up, after the form configuration defaults.
 */
export async function loadProductCatalogSheet(): Promise<number> {
    const done = await prisma.moduleSetting.findUnique({ where: { module_key: MARKER } });
    if (done) return 0;

    const actor = { id: 0, username: SYSTEM_USER, role: 'Admin' };
    // One transaction (all or nothing), with room for 55 numbered, audited inserts.
    const created = await prisma.$transaction(
        async (tx) => {
            const live = await tx.product.findMany({ where: { isDeleted: false }, select: { productName: true } });
            const taken = new Set(live.map((p) => p.productName.trim().toLowerCase()));
            let count = 0;
            for (const row of PRODUCT_CATALOG_SHEET) {
                const name = row.productName.trim().toLowerCase();
                if (taken.has(name)) continue;
                await createProductRecord(tx, productInputSchema.parse(row), actor);
                taken.add(name);
                count++;
            }
            await tx.moduleSetting.create({ data: { ...MARKER, valueJson: JSON.stringify({ loadedAt: new Date().toISOString(), created: count }), updatedBy: SYSTEM_USER } });
            return count;
        },
        { timeout: 120_000, maxWait: 20_000 },
    );
    if (created > 0) {
        await cacheService.invalidateEntityCaches('products');
        await afterManufacturersAdded(true);
    }
    return created;
}

/** Start-up wrapper: a failure (e.g. another instance loading it at the same moment) must not stop the API. */
export async function loadProductCatalogSheetSafely(): Promise<void> {
    try {
        const created = await loadProductCatalogSheet();
        if (created > 0) logger.info({ created }, 'Product Catalog sheet loaded');
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Product Catalog sheet not loaded');
    }
}
