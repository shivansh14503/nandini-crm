import type { Product, ProductFormData } from '../types/product.types';

const PRODUCTS_STORAGE_KEY = 'nandini_crm_products_data_v1';

const SAMPLE_PRODUCTS: Product[] = [
    {
        id: 'prod-001',
        productCode: 'PRD-1001',
        productName: 'Dell PowerEdge R750 Server',
        hsnCode: '84715000',
        category: 'Hardware',
        type: 'Product',
        manufacturer: 'Dell Technologies',
        taxType: 'GST',
        taxRate: '18%',
        discount: '5',
        cost: '350000',
        mrp: '420000',
        msp: '390000',
        contractCreate: 'Yes',
        description: 'Enterprise rack server with dual Intel Xeon processors, ideal for data center deployments.',
        termsAndConditions: 'Standard warranty of 3 years on-site support. Delivery within 15 working days.',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'prod-002',
        productCode: 'PRD-1002',
        productName: 'Cisco Catalyst 9300 Switch',
        hsnCode: '85176200',
        category: 'Networking',
        type: 'Product',
        manufacturer: 'Cisco Systems',
        taxType: 'GST',
        taxRate: '18%',
        discount: '8',
        cost: '125000',
        mrp: '160000',
        msp: '145000',
        contractCreate: 'No',
        description: '48-port PoE+ gigabit switch with advanced security and software-defined networking.',
        termsAndConditions: 'Lifetime hardware warranty. SMARTnet support billed annually.',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'prod-003',
        productCode: 'PRD-1003',
        productName: 'Microsoft 365 Business Premium',
        hsnCode: '99831190',
        category: 'Software',
        type: 'Subscription',
        manufacturer: 'Microsoft Corporation',
        taxType: 'GST',
        taxRate: '18%',
        discount: '10',
        cost: '1050',
        mrp: '1400',
        msp: '1250',
        contractCreate: 'Yes',
        description: 'Microsoft 365 Business Premium subscription per user per month with full suite access.',
        termsAndConditions: 'Annual subscription. Auto-renewal unless cancelled 30 days prior to renewal date.',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'prod-004',
        productCode: 'PRD-1004',
        productName: 'Fortinet FortiGate 200F Firewall',
        hsnCode: '85176990',
        category: 'Security',
        type: 'Product',
        manufacturer: 'Fortinet',
        taxType: 'GST',
        taxRate: '18%',
        discount: '6',
        cost: '280000',
        mrp: '340000',
        msp: '310000',
        contractCreate: 'Yes',
        description: 'Next-generation firewall with SD-WAN, IPS, and advanced threat protection.',
        termsAndConditions: '1-year license included. FortiCare support available separately.',
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'prod-005',
        productCode: 'PRD-1005',
        productName: 'HP LaserJet Pro MFP 4103fdw',
        hsnCode: '84433100',
        category: 'Peripherals',
        type: 'Product',
        manufacturer: 'HP Inc.',
        taxType: 'GST',
        taxRate: '18%',
        discount: '4',
        cost: '28000',
        mrp: '36000',
        msp: '32000',
        contractCreate: 'No',
        description: 'Multifunction laser printer with duplex printing, fax, and wireless connectivity.',
        termsAndConditions: '1-year carry-in warranty. Toner cartridges sold separately.',
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
];

export function getStoredProducts(): Product[] {
    if (typeof window === 'undefined') return SAMPLE_PRODUCTS;
    try {
        const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    saveStoredProducts(SAMPLE_PRODUCTS);
    return SAMPLE_PRODUCTS;
}

export function saveStoredProducts(products: Product[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
    } catch {}
}

export function getStoredProductById(id: string): Product | undefined {
    const list = getStoredProducts();
    return list.find((p) => p.id === id);
}

export function addStoredProduct(data: ProductFormData): Product {
    const list = getStoredProducts();
    const now = new Date().toISOString();
    const newProduct: Product = {
        ...data,
        id: `prod-${Date.now()}`,
        productCode: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: now,
        updatedAt: now,
        createdBy: 'mittal.sharma',
    };
    const updatedList = [newProduct, ...list];
    saveStoredProducts(updatedList);
    return newProduct;
}

export function updateStoredProduct(id: string, updates: Partial<ProductFormData>): Product | null {
    const list = getStoredProducts();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const updated: Product = {
        ...list[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    saveStoredProducts(list);
    return updated;
}

export function deleteStoredProduct(id: string): boolean {
    const list = getStoredProducts();
    const filtered = list.filter((p) => p.id !== id);
    if (filtered.length !== list.length) {
        saveStoredProducts(filtered);
        return true;
    }
    return false;
}

export function deleteMultipleStoredProducts(ids: string[]): boolean {
    const idSet = new Set(ids);
    const list = getStoredProducts();
    const filtered = list.filter((p) => !idSet.has(p.id));
    saveStoredProducts(filtered);
    return true;
}
