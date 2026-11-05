import type { PdfModuleAdapter } from './contexts/contextTypes.js';
import { quotationPdfAdapter } from './contexts/quotationContext.js';
import type { PdfModule } from './pdf.types.js';
import { buildSampleQuotationContext } from './sampleContext.js';

/** One entry per PDF module: how to load a record's meta, its context, and the preview sample. */
export const PDF_MODULE_ADAPTERS: Record<PdfModule, PdfModuleAdapter> = {
    QUOTATION: { ...quotationPdfAdapter, buildSampleContext: buildSampleQuotationContext },
};
