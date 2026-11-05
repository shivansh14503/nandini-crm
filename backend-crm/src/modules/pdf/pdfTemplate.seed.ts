import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { PDF_MODULES } from './pdf.types.js';
import { toMargins } from './pdfTemplate.mapper.js';
import { sanitizeTemplateCss, sanitizeTemplateHtml } from './sanitize.js';
import { SYSTEM_TEMPLATES, type SystemTemplate } from './systemTemplates/index.js';
import { invalidateTemplate } from './templateEngine.js';

const SEED_USER = 'system';

function contentOf(t: SystemTemplate) {
    return {
        description: t.description,
        pageSize: t.pageSize,
        orientation: t.orientation,
        marginTop: t.margins.top,
        marginRight: t.margins.right,
        marginBottom: t.margins.bottom,
        marginLeft: t.margins.left,
        marginHeader: t.margins.header,
        marginFooter: t.margins.footer,
        headerHtml: sanitizeTemplateHtml(t.headerHtml) || null,
        bodyHtml: sanitizeTemplateHtml(t.bodyHtml),
        footerHtml: sanitizeTemplateHtml(t.footerHtml) || null,
        css: sanitizeTemplateCss(t.css) || null,
    };
}

/**
 * Idempotent: inserts missing system templates, refreshes the content of existing ones when the code changed
 * (bumping their version; isActive / isDefault are left as admins set them) and gives each module a default
 * (its Classic template) when it has none. Non-system templates are never touched.
 */
export async function ensurePdfTemplatesSeeded(): Promise<void> {
    let created = 0;
    let refreshed = 0;
    let defaulted = 0;

    for (const template of SYSTEM_TEMPLATES) {
        const content = contentOf(template);
        const existing = await prisma.pdfTemplate.findFirst({ where: { module: template.module, name: template.name, isSystem: true } });
        if (!existing) {
            await prisma.pdfTemplate.create({
                data: { name: template.name, module: template.module, isSystem: true, isActive: true, isDefault: false, ...content, createdBy: SEED_USER, updatedBy: SEED_USER },
            });
            created++;
            continue;
        }
        const m = toMargins(existing);
        const unchanged =
            existing.description === content.description &&
            existing.pageSize === content.pageSize &&
            existing.orientation === content.orientation &&
            m.top === content.marginTop &&
            m.right === content.marginRight &&
            m.bottom === content.marginBottom &&
            m.left === content.marginLeft &&
            m.header === content.marginHeader &&
            m.footer === content.marginFooter &&
            existing.headerHtml === content.headerHtml &&
            existing.bodyHtml === content.bodyHtml &&
            existing.footerHtml === content.footerHtml &&
            existing.css === content.css &&
            !existing.isDeleted;
        if (unchanged) continue;
        await prisma.pdfTemplate.update({
            where: { id: existing.id },
            data: { ...content, isDeleted: false, deletedAt: null, version: { increment: 1 }, updatedBy: SEED_USER },
        });
        invalidateTemplate(existing.id);
        refreshed++;
    }

    for (const module of PDF_MODULES) {
        const hasDefault = await prisma.pdfTemplate.findFirst({ where: { module, isDefault: true, isActive: true, isDeleted: false }, select: { id: true } });
        if (hasDefault) continue;
        const candidateName = SYSTEM_TEMPLATES.find((t) => t.module === module && t.isDefaultCandidate)?.name;
        const candidate =
            (candidateName
                ? await prisma.pdfTemplate.findFirst({ where: { module, name: candidateName, isSystem: true, isActive: true, isDeleted: false } })
                : null) ?? (await prisma.pdfTemplate.findFirst({ where: { module, isSystem: true, isActive: true, isDeleted: false }, orderBy: { name: 'asc' } }));
        if (!candidate) continue;
        await prisma.$transaction([
            prisma.pdfTemplate.updateMany({ where: { module, isDefault: true }, data: { isDefault: false } }),
            prisma.pdfTemplate.update({ where: { id: candidate.id }, data: { isDefault: true, version: { increment: 1 } } }),
        ]);
        defaulted++;
    }

    if (created || refreshed || defaulted) logger.info({ created, refreshed, defaulted }, 'PDF system templates seeded');
}

/** Boot-time wrapper: a seeding failure (e.g. migration not applied yet) must not stop the API. */
export async function seedPdfTemplatesSafely(): Promise<void> {
    try {
        await ensurePdfTemplatesSeeded();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'PDF template seeding skipped');
    }
}
