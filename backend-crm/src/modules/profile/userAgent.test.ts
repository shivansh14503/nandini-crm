import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeUserAgent } from './userAgent.js';

const UA = {
    chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
    safariIpad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36',
    samsungAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
    operaWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0',
    chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    edgeAndroid: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0',
};

describe('describeUserAgent', () => {
    it('names common browsers and operating systems', () => {
        assert.equal(describeUserAgent(UA.chromeWindows), 'Chrome on Windows');
        assert.equal(describeUserAgent(UA.edgeWindows), 'Edge on Windows');
        assert.equal(describeUserAgent(UA.firefoxLinux), 'Firefox on Linux');
        assert.equal(describeUserAgent(UA.safariMac), 'Safari on macOS');
        assert.equal(describeUserAgent(UA.safariIphone), 'Safari on iOS');
        assert.equal(describeUserAgent(UA.chromeIphone), 'Chrome on iOS');
        assert.equal(describeUserAgent(UA.safariIpad), 'Safari on iPadOS');
        assert.equal(describeUserAgent(UA.chromeAndroid), 'Chrome on Android');
        assert.equal(describeUserAgent(UA.samsungAndroid), 'Samsung Internet on Android');
        assert.equal(describeUserAgent(UA.operaWindows), 'Opera on Windows');
        assert.equal(describeUserAgent(UA.firefoxMac), 'Firefox on macOS');
        assert.equal(describeUserAgent(UA.chromeOs), 'Chrome on ChromeOS');
        assert.equal(describeUserAgent(UA.edgeAndroid), 'Edge on Android');
    });

    it('falls back to what it can tell', () => {
        assert.equal(describeUserAgent('Mozilla/5.0 (Linux; Android 14) SomeApp/1.0'), 'Android device');
        assert.equal(describeUserAgent('Firefox/133.0'), 'Firefox');
        assert.equal(describeUserAgent('curl/8.5.0'), 'Unknown device');
        assert.equal(describeUserAgent(''), 'Unknown device');
        assert.equal(describeUserAgent('   '), 'Unknown device');
        assert.equal(describeUserAgent(null), 'Unknown device');
        assert.equal(describeUserAgent(undefined), 'Unknown device');
    });
});
