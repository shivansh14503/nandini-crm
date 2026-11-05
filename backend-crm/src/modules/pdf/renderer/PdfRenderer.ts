import type { Orientation, PageSize, PdfMargins, RenderMeta } from '../pdf.types.js';

/** Everything a renderer needs; HTML is already compiled, sanitized and wrapped (see document.ts). */
export interface PdfRenderInput {
    html: string;
    /** Chromium header/footer templates (already wrapped by wrapHeaderFooter), or undefined for none. */
    headerHtml?: string;
    footerHtml?: string;
    pageSize: PageSize;
    orientation: Orientation;
    margins: PdfMargins;
    /** Logged with timings. Document contents are never logged. */
    meta?: RenderMeta;
}

/**
 * HTML → PDF backend. The Puppeteer implementation lives in puppeteerRenderer.ts; a Gotenberg (or any other)
 * implementation only has to satisfy this interface and be returned from `getPdfRenderer()`.
 */
export interface PdfRenderer {
    renderPdf(input: PdfRenderInput): Promise<Buffer>;
    shutdown(): Promise<void>;
}
