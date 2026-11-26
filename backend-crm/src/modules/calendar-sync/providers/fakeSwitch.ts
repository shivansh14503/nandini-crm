import { ENV } from '../../../config/env.js';

/**
 * Whether the dev-only `fake` calendar provider is on (CALENDAR_FAKE_PROVIDER=true and NODE_ENV ≠ production), with a
 * test override. A leaf module (no adapter or service imports), so any module can ask it without importing the
 * provider registry.
 */

let fakeEnabledOverride: boolean | null = null;

export function isFakeProviderEnabled(): boolean {
    return fakeEnabledOverride ?? ENV.INTEGRATIONS.FAKE_PROVIDER;
}

/** Tests: force the fake provider on / off (null = back to the environment). */
export function setFakeProviderEnabledForTests(enabled: boolean | null): void {
    fakeEnabledOverride = enabled;
}
