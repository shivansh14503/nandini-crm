import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opportunityLabel } from './opportunityLabel.js';

describe('opportunityLabel', () => {
    it('prefers the name, then the products, then the organization', () => {
        assert.equal(opportunityLabel({ opportunityName: 'Tally Prime', productCategoryJson: '["A"]', organizationName: 'Org' }), 'Tally Prime');
        assert.equal(opportunityLabel({ opportunityName: null, productCategoryJson: '["A","B"]', organizationName: 'Org' }), 'A, B');
        assert.equal(opportunityLabel({ opportunityName: '', productCategoryJson: null, organizationName: 'Org' }), 'Org');
    });

    it('cuts a long product list to the 200-character label columns by default (contracts and activities)', () => {
        const products = JSON.stringify(Array.from({ length: 30 }, (_, i) => `Product category number ${i + 1}`));
        const label = opportunityLabel({ opportunityName: null, productCategoryJson: products, organizationName: 'Org' });
        assert.equal(label.length <= 200, true);
        assert.equal(label.endsWith('…'), true);
    });
});
