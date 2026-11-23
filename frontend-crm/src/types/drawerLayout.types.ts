// ─── Record side drawer layouts ───────────────────────────────────────────────
// Mirrors backend-crm/src/modules/drawer-layouts (/api/drawer-layouts, /api/drawer-pieces). The layout document
// itself (schema, limits, helpers) is the generated copy in lib/drawer-layout.

import type { DrawerLayoutDocument, DrawerLayoutModule, DrawerSection } from '@/lib/drawer-layout';

export interface DrawerLayoutConfig {
    module: DrawerLayoutModule;
    layout: DrawerLayoutDocument;
    /** Bumped on every save; send back the one edited so a newer save isn't overwritten (409). */
    version: number;
    updatedBy: string | null;
    updatedAt: string;
}

export interface SaveDrawerLayoutPayload {
    layout: DrawerLayoutDocument;
    /** Version the admin edited; null when the module had no saved layout. */
    version: number | null;
}

/** A section saved to the builder's Pieces library. */
export interface DrawerPiece {
    id: string;
    module: DrawerLayoutModule;
    name: string;
    section: DrawerSection;
    createdBy: string;
    createdAt: string;
}
