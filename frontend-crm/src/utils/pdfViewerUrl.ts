/**
 * URL for showing a PDF inside an <iframe>: asks the browser's built-in PDF viewer (Chrome, Edge, Firefox)
 * to open with its thumbnail / outline sidebar closed and the toolbar still shown. Only the iframe src gets
 * these fragment parameters; Open file and Download keep using the plain file URL.
 */
export const PDF_VIEWER_PARAMS = 'toolbar=1&navpanes=0&pagemode=none';

export function pdfViewerUrl(url: string): string {
    if (!url) return url;
    const hashAt = url.indexOf('#');
    const base = hashAt === -1 ? url : url.slice(0, hashAt);
    const existing = hashAt === -1 ? '' : url.slice(hashAt + 1);
    return `${base}#${existing ? `${existing}&` : ''}${PDF_VIEWER_PARAMS}`;
}
