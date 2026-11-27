/**
 * Line item math shared by opportunities and quotations (Jira CRM-111). Pure: no database, no framework.
 *
 * The same file is in `backend-crm/src/modules/shared/lineItemMath.ts` and `frontend-crm/src/lib/line-items/lineItemMath.ts`
 * (a backend test checks they are identical), so the form, the drawer, the PDF and the API agree to the paisa. Change
 * both together.
 *
 * Per line:
 *   Gross Amount   = Quantity × Rate
 *   Discount       = a percentage of the Gross Amount, or a flat amount off the line (`discountType`), never more
 *                    than the Gross Amount (the line stores what was entered and the amount it comes to)
 *   Taxable Amount = Gross Amount − Discount
 *   GST            = Taxable Amount × the line's GST rate (not shown per line; summed into the totals)
 * Totals (to the paisa; see lineItemSummary): Total Taxable Amount (subtotal), Lump Sum Discount, Actual (Before Tax),
 *   GST per rate (IGST, or CGST + SGST, by the company's and the customer's states), Round Off and Grand Total. Gross
 *   Amount (totalAmount) and Discount (totalDiscount) are kept for reports and PDFs.
 */

/** Fallback options of the Product Catalog's Tax Rate dropdown (`product_tax_rate`), which line items use as GST. */
export const LINE_ITEM_TAX_RATES = ['0%', '5%', '12%', '18%', '28%'] as const;

/** How a line's Discount is entered: a percentage of the Gross Amount, or an amount off the line. */
export const LINE_ITEM_DISCOUNT_TYPES = ['percentage', 'amount'] as const;
export type LineItemDiscountType = (typeof LINE_ITEM_DISCOUNT_TYPES)[number];
export const DEFAULT_DISCOUNT_TYPE: LineItemDiscountType = 'percentage';

/** A stored or sent discount type; anything unknown (missing, older lines) reads as a percentage. */
export const toDiscountType = (value: unknown): LineItemDiscountType => (value === 'amount' ? 'amount' : 'percentage');

export interface LineItemMathInput {
    quantity: number;
    rate: number;
    /** Percentage of the Gross Amount (0–100), or an amount off the line, by `discountType`. */
    discount: number;
    /** `percentage` when missing. */
    discountType?: string | null;
    /** `18%` (a Tax Rate option of the Product Catalog). */
    taxRate: string;
}

export interface LineItemAmounts {
    grossAmount: number;
    discountAmount: number;
    taxableAmount: number;
}

const finite = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
};

/** Money to the paisa (2 decimals), rounding halves away from zero the same way in every engine. */
export const roundMoney = (value: number): number => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

/** `18%`, `GST 18%`, `12.5 %` → 18 / 12.5; `--None--`, `` and anything without a percentage → 0. */
export function parseTaxRate(taxRate: string | null | undefined): number {
    const match = (taxRate ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : 0;
}

/**
 * A stored or typed GST value in the Product Catalog's format: `GST 18%` → `18%` (the older line item format),
 * `--None--` → `0%`, a bare `18` → `18%`. Blank stays blank (the GST is then still to be picked).
 */
export function normalizeTaxRate(taxRate: string | null | undefined): string {
    const value = (taxRate ?? '').trim();
    if (!value) return '';
    if (value === '--None--') return '0%';
    const match = value.match(/(\d+(?:\.\d+)?)\s*%?/);
    return match ? `${Number(match[1])}%` : value;
}

/** A discount as a percentage of the Gross Amount, kept between 0 and 100. */
export const clampDiscount = (discount: number): number => Math.min(100, Math.max(0, finite(discount)));

/** Gross Amount, Discount (amount) and Taxable Amount of one line. An amount discount stops at the Gross Amount. */
export function lineItemAmounts(item: Pick<LineItemMathInput, 'quantity' | 'rate' | 'discount' | 'discountType'>): LineItemAmounts {
    const grossAmount = roundMoney(finite(item.quantity) * finite(item.rate));
    const discountAmount =
        toDiscountType(item.discountType) === 'amount'
            ? roundMoney(Math.min(grossAmount, Math.max(0, finite(item.discount))))
            : roundMoney((grossAmount * clampDiscount(item.discount)) / 100);
    return { grossAmount, discountAmount, taxableAmount: roundMoney(grossAmount - discountAmount) };
}

// ── Summary breakdown (Jira CRM-111) ─────────────────────────────────────────

/**
 * How GST is charged: `IGST` when the customer's state differs from the company's (Admin › Company Details), else
 * `CGST_SGST` (half the rate each). `null` while the company state isn't set: the tax shows as plain "GST".
 */
export const GST_TYPES = ['IGST', 'CGST_SGST'] as const;
export type GstType = (typeof GST_TYPES)[number];

/** A stored or sent GST type; anything else (missing, blank) is `null`. */
export const toGstType = (value: unknown): GstType | null => (value === 'IGST' || value === 'CGST_SGST' ? value : null);

/** Indian states and union territories by ISO 3166-2 code, so `IN-DL` / `DL` and `Delhi` count as the same state. */
const INDIAN_STATES: Readonly<Record<string, string>> = {
    AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh',
    CG: 'Chhattisgarh', DL: 'Delhi', DH: 'Dadra and Nagar Haveli and Daman and Diu', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana',
    HP: 'Himachal Pradesh', JK: 'Jammu and Kashmir', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep',
    MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha',
    PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana', TR: 'Tripura',
    UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal',
};

/** Older or colloquial names of Indian states (the address forms' legacy aliases). */
const STATE_ALIASES: Readonly<Record<string, string>> = {
    orissa: 'odisha',
    pondicherry: 'puducherry',
    uttaranchal: 'uttarakhand',
    'new delhi': 'delhi',
    'nct of delhi': 'delhi',
    'national capital territory of delhi': 'delhi',
    'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
    'daman and diu': 'dadra and nagar haveli and daman and diu',
    'andaman and nicobar': 'andaman and nicobar islands',
    'j and k': 'jammu and kashmir',
};

const placeKey = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/** A state value as a comparison key: case, accents, punctuation, ISO codes (`IN-DL`) and old names don't matter. */
export function stateKey(state: string | null | undefined): string {
    const raw = (state ?? '').trim();
    if (!raw) return '';
    const code = raw.toUpperCase().match(/^(?:IN-)?([A-Z]{2})$/)?.[1];
    const key = placeKey(code && INDIAN_STATES[code] ? INDIAN_STATES[code] : raw);
    return STATE_ALIASES[key] ?? key;
}

/** Whether two state values name the same state. Blank never matches. */
export const sameState = (a: string | null | undefined, b: string | null | undefined): boolean => {
    const key = stateKey(a);
    return key !== '' && key === stateKey(b);
};

/**
 * The customer's state for GST (the place of supply): the shipping address's state, or the billing address's when
 * there is no shipping address (or it copies the billing one).
 */
export function customerStateOf(address: { shippingState?: string | null; billingState?: string | null; copyAddressFromBilling?: boolean | null } | null | undefined): string {
    if (!address) return '';
    const billing = (address.billingState ?? '').trim();
    if (address.copyAddressFromBilling) return billing;
    return (address.shippingState ?? '').trim() || billing;
}

/**
 * IGST when the customer's state differs from the company's, else CGST + SGST. A customer without a state is charged
 * like one in the company's state (the place of supply is then the supplier's location). `null` (plain GST) while the
 * company state isn't set.
 */
export function gstTypeFor(companyState: string | null | undefined, customerState: string | null | undefined): GstType | null {
    if (!stateKey(companyState)) return null;
    if (!stateKey(customerState)) return 'CGST_SGST';
    return sameState(companyState, customerState) ? 'CGST_SGST' : 'IGST';
}

/** One GST rate of the document: the Actual (Before Tax) share of the lines at that rate and the tax on it. */
export interface LineItemTaxRow {
    /** GST rate in percent (18, 12.5). */
    rate: number;
    /** The lines' Taxable Amount at this rate less their share of the Lump Sum Discount. */
    taxableValue: number;
    /** IGST, or plain GST while the company state isn't set (gstType null); 0 for CGST + SGST. */
    igst: number;
    /** Half-rate CGST and SGST (equal); 0 for IGST. */
    cgst: number;
    sgst: number;
    /** igst + cgst + sgst. */
    tax: number;
}

/** What the totals depend on besides the lines. */
export interface LineItemTotalsOptions {
    lumpSumDiscount?: number | null;
    /** Round the Grand Total to whole rupees (0.50 rounds up). Default true. */
    roundOff?: boolean | null;
    gstType?: GstType | null;
}

/** The record totals, as stored (to the paisa). */
export interface LineItemTotals {
    /** Gross Amount: Σ Quantity × Rate. */
    totalAmount: number;
    /** Σ line discounts. */
    totalDiscount: number;
    /** Total Taxable Amount: Σ line Taxable Amounts. */
    subtotal: number;
    /** Actual (Before Tax): Total Taxable Amount − Lump Sum Discount. */
    actualBeforeTax: number;
    /** GST: Σ IGST, or Σ CGST + SGST. */
    totalTax: number;
    /** Round Off: what rounding the Grand Total added (+) or took off (−); 0 when Round Off is off. */
    roundOffAmount: number;
    /** Actual (Before Tax) + GST + Round Off. */
    grandTotal: number;
}

/** The totals with the GST rows (one per rate) the Summary Breakdown, drawers and PDFs show. */
export interface LineItemSummary extends LineItemTotals {
    lumpSumDiscount: number;
    roundOff: boolean;
    gstType: GstType | null;
    taxes: LineItemTaxRow[];
}

// Money is added up in whole paisa (integers) and rates in basis points, so every engine gets the same result. Products
// that can outgrow Number's exact range (share of a discount, tax) are worked out with BigInt.
const toPaisa = (value: unknown): number => Math.round(finite(value) * 100);
const fromPaisa = (paisa: number): number => paisa / 100;
const TWO = BigInt(2);
/** n ÷ d rounded half up (n ≥ 0, d > 0). */
const divRound = (n: bigint, d: bigint): bigint => (TWO * n + d) / (TWO * d);
/** A GST rate in basis points (18% → 1800). */
const rateBasisPoints = (taxRate: string | null | undefined): number => Math.max(0, Math.round(parseTaxRate(taxRate) * 100));

/** Whether a stored / sent Round Off flag is on (missing = on, the default). */
export const toRoundOff = (value: unknown): boolean => !(value === false || value === 'false' || value === 0);

/**
 * The Summary Breakdown of a set of lines (Jira CRM-111):
 *   Total Taxable Amount = Σ line Taxable Amounts
 *   Lump Sum Discount    = typed (never more than the Total Taxable Amount)
 *   Actual (Before Tax)  = Total Taxable Amount − Lump Sum Discount
 *   GST                  = per rate: the lines' Taxable Amount at that rate less their share of the Lump Sum Discount
 *                          (shared in proportion, to the paisa), × the rate: IGST, or CGST and SGST at half the rate each
 *   Round Off            = the Grand Total to whole rupees (0.50 rounds up), when on
 *   Grand Total          = Actual (Before Tax) + GST + Round Off
 */
export function lineItemSummary(items: readonly LineItemMathInput[], options: LineItemTotalsOptions = {}): LineItemSummary {
    const gstType = toGstType(options.gstType);
    const roundOff = toRoundOff(options.roundOff);
    let gross = 0;
    let discount = 0;
    const byRate = new Map<number, number>();
    for (const item of items) {
        const amounts = lineItemAmounts(item);
        gross += toPaisa(amounts.grossAmount);
        discount += toPaisa(amounts.discountAmount);
        const rate = rateBasisPoints(item.taxRate);
        byRate.set(rate, (byRate.get(rate) ?? 0) + toPaisa(amounts.taxableAmount));
    }
    const groups = [...byRate.entries()].map(([rate, taxable]) => ({ rate, taxable })).sort((a, b) => a.rate - b.rate);
    const subtotal = groups.reduce((sum, g) => sum + g.taxable, 0);
    const lumpSum = Math.min(subtotal, Math.max(0, toPaisa(options.lumpSumDiscount)));

    // The Lump Sum Discount shared over the rates in proportion to their Taxable Amount (largest remainder, so the
    // shares add up to it exactly).
    const shares = groups.map(() => 0);
    if (lumpSum > 0 && subtotal > 0) {
        const total = BigInt(subtotal);
        const exact = groups.map((g) => BigInt(lumpSum) * BigInt(g.taxable));
        exact.forEach((value, i) => (shares[i] = Number(value / total)));
        let left = lumpSum - shares.reduce((sum, s) => sum + s, 0);
        const order = groups
            .map((g, i) => ({ i, remainder: exact[i] % total, taxable: g.taxable }))
            .sort((a, b) => (a.remainder === b.remainder ? b.taxable - a.taxable || a.i - b.i : a.remainder > b.remainder ? -1 : 1));
        for (const { i } of order) {
            if (left <= 0) break;
            shares[i] += 1;
            left -= 1;
        }
    }

    const taxes: LineItemTaxRow[] = [];
    let totalTax = 0;
    groups.forEach((g, i) => {
        const base = g.taxable - shares[i];
        if (g.rate <= 0 || base <= 0) return;
        const product = BigInt(base) * BigInt(g.rate);
        let igst = 0;
        let half = 0;
        if (gstType === 'CGST_SGST') half = Number(divRound(product, BigInt(20000)));
        else igst = Number(divRound(product, BigInt(10000)));
        const tax = igst + 2 * half;
        totalTax += tax;
        taxes.push({ rate: g.rate / 100, taxableValue: fromPaisa(base), igst: fromPaisa(igst), cgst: fromPaisa(half), sgst: fromPaisa(half), tax: fromPaisa(tax) });
    });

    const actualBeforeTax = subtotal - lumpSum;
    const beforeRounding = actualBeforeTax + totalTax;
    const grandTotal = roundOff ? Number(divRound(BigInt(beforeRounding), BigInt(100)) * BigInt(100)) : beforeRounding;
    return {
        totalAmount: fromPaisa(gross),
        totalDiscount: fromPaisa(discount),
        subtotal: fromPaisa(subtotal),
        lumpSumDiscount: fromPaisa(lumpSum),
        actualBeforeTax: fromPaisa(actualBeforeTax),
        gstType,
        taxes,
        totalTax: fromPaisa(totalTax),
        roundOff,
        roundOffAmount: fromPaisa(grandTotal - beforeRounding),
        grandTotal: fromPaisa(grandTotal),
    };
}

/** The stored record totals of a set of lines (lineItemSummary without the GST rows). */
export function lineItemTotals(items: readonly LineItemMathInput[], options: LineItemTotalsOptions = {}): LineItemTotals {
    const s = lineItemSummary(items, options);
    return {
        totalAmount: s.totalAmount,
        totalDiscount: s.totalDiscount,
        subtotal: s.subtotal,
        actualBeforeTax: s.actualBeforeTax,
        totalTax: s.totalTax,
        roundOffAmount: s.roundOffAmount,
        grandTotal: s.grandTotal,
    };
}

/** Σ of one GST component over the rows (IGST, CGST or SGST). */
export const sumTax = (taxes: readonly LineItemTaxRow[], component: 'igst' | 'cgst' | 'sgst'): number =>
    fromPaisa(taxes.reduce((sum, row) => sum + toPaisa(row[component]), 0));

/** Name of the tax for a GST type: IGST, CGST / SGST, or plain GST while the company state isn't set. */
export const GST_TYPE_LABELS: Record<GstType, string> = { IGST: 'IGST', CGST_SGST: 'CGST + SGST' };

/** `18%`, `12.5%`: a rate as the GST rows show it. */
export const formatRate = (rate: number): string => `${Math.round(rate * 100) / 100}%`;

/**
 * The Summary Breakdown's GST rows of one rate, labelled and valued the same on the form, the view page, the drawers and
 * the PDF: `Add: IGST @ 18%`, or `Add: CGST @ 9%` and `Add: SGST @ 9%`, or `Add: GST @ 18%` without a company state.
 */
export function taxRowLines(row: LineItemTaxRow, gstType: GstType | null): { key: 'igst' | 'cgst' | 'sgst'; label: string; amount: number }[] {
    if (gstType === 'CGST_SGST') {
        const half = formatRate(row.rate / 2);
        return [
            { key: 'cgst', label: `Add: CGST @ ${half}`, amount: row.cgst },
            { key: 'sgst', label: `Add: SGST @ ${half}`, amount: row.sgst },
        ];
    }
    return [{ key: 'igst', label: `Add: ${gstType === 'IGST' ? 'IGST' : 'GST'} @ ${formatRate(row.rate)}`, amount: row.igst }];
}

/** A line nothing was entered on (no product, rate, discount, description or note): it is not saved. */
export function isBlankLineItem(item: { productName?: unknown; productId?: unknown; rate?: unknown; discount?: unknown; description?: unknown; note?: unknown }): boolean {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    return !text(item.productName) && !text(item.productId) && !finite(item.rate) && !finite(item.discount) && !text(item.description) && !text(item.note);
}
