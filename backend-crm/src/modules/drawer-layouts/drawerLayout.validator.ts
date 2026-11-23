import { z } from 'zod';
import { DRAWER_LAYOUT_MODULES, documentSchema, pieceSchema } from './document/index.js';

export const drawerModuleSchema = z.enum(DRAWER_LAYOUT_MODULES, {
    error: `module must be one of: ${DRAWER_LAYOUT_MODULES.join(', ')}.`,
});

export const drawerModuleParamSchema = z.object({ module: drawerModuleSchema });

export const saveDrawerLayoutSchema = z.object({
    layout: documentSchema,
    /** Version the admin edited (null when no layout was saved yet); a newer saved version is a 409. */
    version: z.number().int().min(1).nullable(),
});

export const drawerPieceListQuerySchema = z.object({ module: drawerModuleSchema });

export const createDrawerPieceSchema = pieceSchema.extend({ module: drawerModuleSchema });

export const drawerPieceIdParamSchema = z.object({ id: z.string().trim().min(1).max(50) });
