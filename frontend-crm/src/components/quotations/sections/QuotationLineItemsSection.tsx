'use client';

import { CrmLineItemsSection, type CrmLineItemsSectionProps } from '@/components/forms/rhf/CrmLineItemsSection';

export * from '@/components/forms/rhf/CrmLineItemsSection';
export type { CrmLineItemsSectionProps as QuotationLineItemsSectionProps } from '@/components/forms/rhf/CrmLineItemsSection';

/** The shared line items editor with the quotation's Currency (opportunities have none). */
export function QuotationLineItemsSection(props: CrmLineItemsSectionProps = {}) {
    return <CrmLineItemsSection withCurrency {...props} />;
}
