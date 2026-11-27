import type { TransactionClient } from '../../config/prisma.js';
import { invalidateFormConfigCaches } from '../form-configs/formConfig.service.js';
import { acquireLocks } from '../shared/transactions.js';

/** The Manufacturer dropdown (Form Builder › Dropdowns › Products › Manufacturer). */
export const MANUFACTURER_CATEGORY_KEY = 'product_manufacturer';

/**
 * Adds a product's Manufacturer to the Manufacturer dropdown when it isn't an option yet, so the next product offers
 * it. Names match ignoring case (the column's collation): "dell" is the existing "Dell". An archived option counts as
 * present (the admin archived it on purpose). Nothing happens when the dropdown was deleted. Runs inside the caller's
 * transaction; returns whether an option was added, so the caller drops the form-config cache after the commit.
 */
export async function ensureManufacturerOption(tx: TransactionClient, manufacturer: string | null | undefined): Promise<boolean> {
    const value = (manufacturer ?? '').trim();
    if (!value) return false;
    const category = await tx.dropdownCategory.findUnique({ where: { key: MANUFACTURER_CATEGORY_KEY }, select: { id: true, deletedAt: true } });
    if (!category || category.deletedAt) return false;
    // Two products saved at once with the same new manufacturer add it once.
    await acquireLocks(tx, [`product:manufacturer:${value.toLowerCase()}`]);
    const existing = await tx.dropdownOption.findFirst({ where: { categoryId: category.id, value }, select: { id: true } });
    if (existing) return false;
    const last = await tx.dropdownOption.aggregate({ where: { categoryId: category.id }, _max: { sortOrder: true } });
    await tx.dropdownOption.create({
        data: { categoryId: category.id, value, label: value, sortOrder: (last._max.sortOrder ?? 0) + 10 },
    });
    return true;
}

/** Drops the cached form configuration after new manufacturers were added (call after the transaction commits). */
export async function afterManufacturersAdded(added: boolean): Promise<void> {
    if (added) await invalidateFormConfigCaches();
}
