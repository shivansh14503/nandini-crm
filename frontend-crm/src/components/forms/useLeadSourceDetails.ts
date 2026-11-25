'use client';

import React from 'react';
import { useFormContext, useWatch, type FieldValues, type Path, type PathValue } from 'react-hook-form';
import { isPartnerLeadSource, leadSourceNeedsReferredBy } from '@/utils/leadSource';

interface LeadSourceDetailNames<F extends FieldValues> {
    leadSource: Path<F>;
    referredBy: Path<F>;
    partnerCompany: Path<F>;
}

/**
 * The follow-up field a Lead Source asks for, on the Lead, Opportunity and Convert Lead forms: Referred By for CA /
 * Reference, Partner Company for Partner (both then required, see `leadSourceDetailIssues`). When the Lead Source
 * moves off those options the field is cleared, as on the Organization form's Partner Company. A Referred By a
 * record already holds under another Lead Source stays shown, so it isn't kept out of sight.
 */
export function useLeadSourceDetails<F extends FieldValues>(names: LeadSourceDetailNames<F>, { readOnly = false } = {}) {
    const { control, getValues, setValue, clearErrors } = useFormContext<F>();
    const leadSource = useWatch({ control, name: names.leadSource }) as string | undefined;
    const referredBy = useWatch({ control, name: names.referredBy }) as string | undefined;
    const needsReferredBy = leadSourceNeedsReferredBy(leadSource);
    const isPartner = isPartnerLeadSource(leadSource);

    const previous = React.useRef({ needsReferredBy, isPartner });
    React.useEffect(() => {
        const was = previous.current;
        previous.current = { needsReferredBy, isPartner };
        if (readOnly) return;
        const clear = (name: Path<F>) => {
            if (getValues(name)) setValue(name, '' as PathValue<F, Path<F>>, { shouldDirty: true });
            clearErrors(name);
        };
        if (was.needsReferredBy && !needsReferredBy) clear(names.referredBy);
        if (was.isPartner && !isPartner) clear(names.partnerCompany);
    }, [needsReferredBy, isPartner, readOnly, names.referredBy, names.partnerCompany, getValues, setValue, clearErrors]);

    return {
        needsReferredBy,
        showReferredBy: needsReferredBy || Boolean(referredBy?.trim()),
        showPartnerCompany: isPartner,
    };
}
