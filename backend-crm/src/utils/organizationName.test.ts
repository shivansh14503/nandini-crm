import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    canonicalizeOrgName,
    compareOrganizationNames,
    extractCoreOrgName,
    findSimilarOrganizations,
    normalizeOrgText,
} from './organizationName.js';

describe('normalizeOrgText', () => {
    it('lowercases, strips punctuation and collapses spaces', () => {
        assert.equal(normalizeOrgText('  ABC   (P)  Ltd.  '), 'abc p ltd');
        assert.equal(normalizeOrgText('A.B.C. Traders'), 'abc traders');
        assert.equal(normalizeOrgText('Sharma & Sons'), 'sharma and sons');
        assert.equal(normalizeOrgText('Café Coffee-Day'), 'cafe coffee day');
    });

    it('drops leading honorific / business prefixes', () => {
        assert.equal(normalizeOrgText('M/s. ABC Pvt Ltd'), 'abc pvt ltd');
        assert.equal(normalizeOrgText('M / S ABC'), 'abc');
        assert.equal(normalizeOrgText('Messrs The ABC'), 'abc');
        assert.equal(normalizeOrgText('Shri Ram Traders'), 'ram traders');
        assert.equal(normalizeOrgText('The'), 'the');
        assert.equal(normalizeOrgText('Msme Corp'), 'msme corp');
    });
});

describe('canonicalizeOrgName', () => {
    it('folds private limited variants to "pvt ltd"', () => {
        for (const name of ['ABC Pvt Ltd', 'ABC Private Limited', 'M/s. ABC Private Limited.', 'abc (p) ltd', 'ABC Pvt. Ltd.', 'ABC Pvt.Ltd.', 'ABC PvtLtd', 'ABC Private Ltd', 'ABC Pvt Limited']) {
            assert.equal(canonicalizeOrgName(name), 'abc pvt ltd', name);
        }
    });

    it('folds other legal forms and business words', () => {
        assert.equal(canonicalizeOrgName('ABC Public Limited'), 'abc ltd');
        assert.equal(canonicalizeOrgName('ABC Limited'), 'abc ltd');
        assert.equal(canonicalizeOrgName('ABC Limited Liability Partnership'), 'abc llp');
        assert.equal(canonicalizeOrgName('ABC One Person Company'), 'abc opc');
        assert.equal(canonicalizeOrgName('Acme Technology Solns Intl Corporation'), 'acme technologies solutions international corp');
        assert.equal(canonicalizeOrgName('Mehta Inds & Co'), 'mehta industries and co');
    });

    it('does not touch words that merely contain a suffix', () => {
        assert.equal(canonicalizeOrgName('Indigo Coal Company'), 'indigo coal co');
        assert.equal(canonicalizeOrgName('Technocrats'), 'technocrats');
    });
});

describe('extractCoreOrgName', () => {
    it('strips trailing legal suffixes', () => {
        assert.equal(extractCoreOrgName('ABC Private Limited'), 'abc');
        assert.equal(extractCoreOrgName('ABC'), 'abc');
        assert.equal(extractCoreOrgName('Sharma & Co'), 'sharma');
        assert.equal(extractCoreOrgName('Gupta Family HUF'), 'gupta family');
        assert.equal(extractCoreOrgName('ABC Technologies Pvt Ltd'), 'abc technologies');
    });

    it('falls back to the canonical name when nothing distinctive is left', () => {
        assert.equal(extractCoreOrgName('Limited'), 'ltd');
        assert.equal(extractCoreOrgName('  '), '');
    });
});

describe('compareOrganizationNames', () => {
    it('ranks exact > canonical > core', () => {
        assert.deepEqual(compareOrganizationNames('abc pvt ltd ', 'ABC Pvt Ltd'), { matchKind: 'exact', score: 1 });
        const canonical = compareOrganizationNames('ABC Private Limited', 'ABC Pvt Ltd');
        assert.equal(canonical.matchKind, 'canonical');
        assert.equal(canonical.score, 0.98);
        assert.match(canonical.reason ?? '', /ABC Pvt Ltd/);
        assert.equal(compareOrganizationNames('ABC Limited', 'ABC Pvt Ltd').matchKind, 'core');
        assert.equal(compareOrganizationNames('ABC', 'ABC Pvt Ltd').matchKind, 'core');
    });

    it('matches partially typed names as prefix', () => {
        for (const typed of ['AB', 'abc p', 'abc privat', 'abc pvt l']) {
            const result = compareOrganizationNames(typed, 'ABC Pvt Ltd');
            assert.equal(result.matchKind, 'prefix', typed);
            assert.ok(result.score >= 0.75 && result.score <= 0.88, typed);
        }
        assert.equal(compareOrganizationNames('trad', 'Mohit Traders Pvt Ltd').matchKind, 'prefix');
    });

    it('matches typos as fuzzy', () => {
        const result = compareOrganizationNames('Mohit Tradres', 'Mohit Traders Pvt Ltd');
        assert.equal(result.matchKind, 'fuzzy');
        assert.ok(result.score >= 0.75 && result.score <= 0.85);
    });

    it('rejects unrelated names and empty input', () => {
        assert.equal(compareOrganizationNames('XYZ Industries', 'ABC Pvt Ltd').matchKind, 'none');
        assert.equal(compareOrganizationNames('a', 'ABC Pvt Ltd').matchKind, 'none');
        assert.equal(compareOrganizationNames('', 'ABC Pvt Ltd').matchKind, 'none');
        assert.equal(compareOrganizationNames('Pvt Ltd', 'ABC Pvt Ltd').matchKind, 'prefix');
    });
});

describe('findSimilarOrganizations', () => {
    const orgs = [
        { id: '1', organizationName: 'ABC Pvt Ltd' },
        { id: '2', organizationName: 'ABC Limited' },
        { id: '3', organizationName: 'ABC Exports' },
        { id: '4', organizationName: 'XYZ Corp' },
    ];

    it('sorts by score, excludes the edited record and unrelated names', () => {
        const results = findSimilarOrganizations(orgs, 'ABC Private Limited');
        assert.deepEqual(
            results.map((r) => [r.record.id, r.matchKind]),
            [
                ['1', 'canonical'],
                ['2', 'core'],
            ],
        );
        assert.deepEqual(
            findSimilarOrganizations(orgs, 'ABC Private Limited', { excludeId: '1' }).map((r) => r.record.id),
            ['2'],
        );
    });

    it('respects the limit', () => {
        assert.equal(findSimilarOrganizations(orgs, 'abc', { limit: 2 }).length, 2);
        assert.deepEqual(findSimilarOrganizations(orgs, ''), []);
    });
});
