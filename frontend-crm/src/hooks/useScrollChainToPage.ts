import { useEffect, type RefObject } from 'react';

/** Pixels per wheel "line" when the browser reports deltas in lines (Firefox with a mouse wheel). */
const LINE_HEIGHT = 16;

function scrollsVertically(el: HTMLElement): boolean {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const overflowY = getComputedStyle(el).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

/**
 * Whether the scroll areas between `target` and `root` (inclusive) can all go no further in `deltaY`'s direction,
 * while at least one of them exists. When there is none, the browser already scrolls the page by itself.
 */
function innerScrollEnded(target: EventTarget | null, root: HTMLElement, deltaY: number): boolean {
    let sawScroller = false;
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
        if (el instanceof HTMLElement && scrollsVertically(el)) {
            sawScroller = true;
            const max = el.scrollHeight - el.clientHeight;
            if (deltaY < 0 ? el.scrollTop > 0.5 : el.scrollTop < max - 0.5) return false;
        }
        if (el === root) break;
    }
    return sawScroller;
}

function scrollPage(deltaY: number) {
    // `instant`: <html> sets `scroll-behavior: smooth`, which would make every small step animate and lag.
    window.scrollBy({ top: deltaY, behavior: 'instant' });
}

/**
 * Hands scrolling over to the page once a scroll area inside `ref` (a calendar's time grid, agenda, side rail…)
 * reaches its top or bottom, so the page keeps scrolling up or down instead of the gesture being trapped.
 *
 * Browsers chain scrolling only for a new gesture: a wheel / trackpad swipe or touch drag that starts inside the
 * area stays latched to it even after it hits the edge (and iOS bounces the area instead). This moves the rest of
 * that gesture to the page. Mouse wheel, trackpad and touch are covered; horizontal and pinch-zoom gestures, and a
 * touch drag the page itself cancels (moving or resizing an event), are left alone.
 */
export function useScrollChainToPage(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = ref.current;
        if (!root) return;

        const onWheel = (ev: WheelEvent) => {
            if (ev.ctrlKey || ev.deltaY === 0 || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
            if (!innerScrollEnded(ev.target, root, ev.deltaY)) return;
            const unit = ev.deltaMode === 1 ? LINE_HEIGHT : ev.deltaMode === 2 ? window.innerHeight : 1;
            ev.preventDefault();
            scrollPage(ev.deltaY * unit);
        };

        let lastX = 0;
        let lastY = 0;
        let pending = 0;
        let frame = 0;
        // Where the page should be if only this hook moved it; when it isn't, the browser is chaining the
        // gesture itself (it does when the drag starts at the edge) and this hook stays out to avoid double speed.
        let expectedPageY = 0;
        let browserChains = false;
        const onTouchStart = (ev: TouchEvent) => {
            if (ev.touches.length !== 1) return;
            lastX = ev.touches[0].clientX;
            lastY = ev.touches[0].clientY;
            expectedPageY = window.scrollY;
            browserChains = false;
        };
        const onTouchMove = (ev: TouchEvent) => {
            if (ev.touches.length !== 1) return;
            const { clientX, clientY } = ev.touches[0];
            const deltaY = lastY - clientY; // finger moving up scrolls down
            const deltaX = lastX - clientX;
            lastX = clientX;
            lastY = clientY;
            if (Math.abs(window.scrollY - expectedPageY) > 1) browserChains = true;
            if (browserChains || deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY)) return;
            if (!innerScrollEnded(ev.target, root, deltaY)) return;
            pending += deltaY;
            if (frame) return;
            // After every listener has run: a drag of an event cancels the touch on `window`, and then the page stays put.
            frame = requestAnimationFrame(() => {
                frame = 0;
                const top = pending;
                pending = 0;
                if (ev.defaultPrevented || browserChains) return;
                if (Math.abs(window.scrollY - expectedPageY) > 1) {
                    browserChains = true;
                    return;
                }
                scrollPage(top);
                expectedPageY = window.scrollY;
            });
        };

        // Wheel must be non-passive to stop the latched area from swallowing it; touch stays passive (never cancelled).
        root.addEventListener('wheel', onWheel, { passive: false });
        root.addEventListener('touchstart', onTouchStart, { passive: true });
        root.addEventListener('touchmove', onTouchMove, { passive: true });
        return () => {
            root.removeEventListener('wheel', onWheel);
            root.removeEventListener('touchstart', onTouchStart);
            root.removeEventListener('touchmove', onTouchMove);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [ref]);
}
