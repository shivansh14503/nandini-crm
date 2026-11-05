import type { PdfModule } from '../pdf.types.js';
import { classicTemplate } from './classic.js';
import { compactTemplate } from './compact.js';
import { modernTemplate } from './modern.js';
import type { SystemTemplate } from './types.js';

export type { SystemTemplate } from './types.js';

export const SYSTEM_TEMPLATES: readonly SystemTemplate[] = [classicTemplate, modernTemplate, compactTemplate];

export const systemTemplatesFor = (module: PdfModule): SystemTemplate[] => SYSTEM_TEMPLATES.filter((t) => t.module === module);
