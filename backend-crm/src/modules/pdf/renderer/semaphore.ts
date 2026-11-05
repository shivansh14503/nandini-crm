/** Counting semaphore: at most `limit` holders; extra `acquire()` calls wait in FIFO order. */
export class Semaphore {
    private active = 0;
    private readonly waiters: (() => void)[] = [];
    private readonly limit: number;

    constructor(limit: number) {
        this.limit = Math.max(1, Math.trunc(limit));
    }

    get pending(): number {
        return this.waiters.length;
    }

    async acquire(): Promise<() => void> {
        if (this.active >= this.limit) {
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        } else {
            this.active++;
        }
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            // Hand the slot straight to the next waiter (active stays the same), else free it.
            if (next) next();
            else this.active--;
        };
    }

    async run<T>(task: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await task();
        } finally {
            release();
        }
    }
}
