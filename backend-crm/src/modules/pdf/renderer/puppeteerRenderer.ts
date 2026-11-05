import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { HttpError } from '../../../utils/httpError.js';
import type { PdfRenderer, PdfRenderInput } from './PdfRenderer.js';
import { Semaphore } from './semaphore.js';

/**
 * Puppeteer renderer: one lazily launched Chromium shared by every request (relaunched if it dies), a
 * semaphore bounding concurrent pages to PDF_MAX_CONCURRENCY, and per job a fresh incognito context + page
 * with JavaScript disabled and every request except data: / about:blank aborted. Pages and contexts are
 * always closed in `finally`.
 */

const ALLOWED_URL = /^(data:|about:blank)/i;

class PuppeteerPdfRenderer implements PdfRenderer {
    private browserPromise: Promise<Browser> | null = null;
    private readonly semaphore = new Semaphore(ENV.PDF.MAX_CONCURRENCY);
    private closing = false;

    private launch(): Promise<Browser> {
        const args = ['--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu', '--no-first-run', '--disable-extensions'];
        if (ENV.PDF.CHROMIUM_NO_SANDBOX) args.push('--no-sandbox', '--disable-setuid-sandbox');
        const started = Date.now();
        const promise: Promise<Browser> = puppeteer
            .launch({ headless: true, executablePath: ENV.PDF.PUPPETEER_EXECUTABLE_PATH, args })
            .then((browser) => {
                logger.info({ ms: Date.now() - started }, 'PDF renderer browser launched');
                browser.on('disconnected', () => {
                    if (this.browserPromise === promise) this.browserPromise = null;
                    if (!this.closing) logger.warn('PDF renderer browser disconnected; it will be relaunched on the next render');
                });
                return browser;
            })
            .catch((err: unknown) => {
                if (this.browserPromise === promise) this.browserPromise = null;
                logger.error({ err: (err as Error).message }, 'PDF renderer failed to launch Chromium');
                throw new HttpError(
                    'PDF rendering is unavailable: Chromium could not be started. See the README "PDF generation" section.',
                    StatusCodes.SERVICE_UNAVAILABLE,
                    { code: 'PDF_RENDERER_UNAVAILABLE' },
                );
            });
        return promise;
    }

    private async getBrowser(): Promise<Browser> {
        if (this.closing) throw new HttpError('Server is shutting down', StatusCodes.SERVICE_UNAVAILABLE, { code: 'SHUTTING_DOWN' });
        if (!this.browserPromise) this.browserPromise = this.launch();
        const browser = await this.browserPromise;
        if (browser.connected) return browser;
        this.browserPromise = this.launch();
        return this.browserPromise;
    }

    async renderPdf(input: PdfRenderInput): Promise<Buffer> {
        const queuedAt = Date.now();
        return this.semaphore.run(async () => {
            const startedAt = Date.now();
            const timeout = ENV.PDF.RENDER_TIMEOUT_MS;
            const browser = await this.getBrowser();
            const context = await browser.createBrowserContext();
            try {
                const page = await context.newPage();
                try {
                    await page.setJavaScriptEnabled(false);
                    await page.setRequestInterception(true);
                    page.on('request', (request: HTTPRequest) => {
                        if (request.isInterceptResolutionHandled()) return;
                        if (ALLOWED_URL.test(request.url())) void request.continue();
                        else void request.abort('blockedbyclient');
                    });
                    page.setDefaultTimeout(timeout);
                    await page.setContent(input.html, { waitUntil: 'load', timeout });

                    const { margins } = input;
                    const pdf = await page.pdf({
                        format: input.pageSize,
                        landscape: input.orientation === 'landscape',
                        printBackground: true,
                        displayHeaderFooter: Boolean(input.headerHtml || input.footerHtml),
                        headerTemplate: input.headerHtml ?? '<span></span>',
                        footerTemplate: input.footerHtml ?? '<span></span>',
                        margin: {
                            top: `${margins.top}mm`,
                            right: `${margins.right}mm`,
                            bottom: `${margins.bottom}mm`,
                            left: `${margins.left}mm`,
                        },
                        preferCSSPageSize: false,
                        timeout,
                    });
                    const buffer = Buffer.from(pdf);
                    logger.info({ ...input.meta, ms: Date.now() - startedAt, waitMs: startedAt - queuedAt, bytes: buffer.length }, 'PDF rendered');
                    return buffer;
                } finally {
                    await page.close().catch(() => undefined);
                }
            } catch (err) {
                if (err instanceof HttpError) throw err;
                const message = err instanceof Error ? err.message : String(err);
                const timedOut = /timeout|timed out/i.test(message);
                logger.error({ ...input.meta, ms: Date.now() - startedAt, err: message }, 'PDF render failed');
                throw timedOut
                    ? new HttpError('PDF rendering timed out. Try a simpler template or fewer line items.', StatusCodes.GATEWAY_TIMEOUT, { code: 'PDF_RENDER_TIMEOUT' })
                    : new HttpError('PDF rendering failed. Please try again.', StatusCodes.INTERNAL_SERVER_ERROR, { code: 'PDF_RENDER_FAILED' });
            } finally {
                await context.close().catch(() => undefined);
            }
        });
    }

    async shutdown(): Promise<void> {
        this.closing = true;
        const pending = this.browserPromise;
        this.browserPromise = null;
        if (!pending) return;
        try {
            const browser = await pending;
            await browser.close();
            logger.info('PDF renderer browser closed');
        } catch {
            // Launch failed or the browser is already gone.
        }
    }
}

let renderer: PdfRenderer | null = null;

/** The process-wide renderer (created lazily; Chromium itself launches on the first render). */
export function getPdfRenderer(): PdfRenderer {
    if (!renderer) renderer = new PuppeteerPdfRenderer();
    return renderer;
}

/** Closes Chromium; called from the graceful shutdown in app.ts. */
export async function shutdownPdfRenderer(): Promise<void> {
    if (renderer) await renderer.shutdown();
}
