'use client';

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
    CodedDefaultsRecorderProvider,
    type CodedDefaultsRecorder,
    type CodedFieldDefaults,
    type CodedFieldDefaultsMap,
} from '@/context/CodedFieldDefaultsContext';
import type { CrmModuleKey } from '@/types/formConfig.types';

/*
 * The placeholders and hints of built-in fields live in each hand-built form's JSX, not in the form configuration.
 * To show them in the field editor, the builder mounts a hidden, inert copy of the module's real create form
 * with a recorder: field primitives report the texts they were coded with (and skip admin overrides, so the copy
 * renders exactly as coded). Controls that aren't config-aware primitives are read from the rendered inputs.
 */

const LeadForm = dynamic(() => import('@/components/leads/LeadForm'), { ssr: false });
const OpportunityForm = dynamic(() => import('@/components/opportunities/OpportunityForm'), { ssr: false });
const CreateQuoteForm = dynamic(() => import('@/components/quotations/CreateQuoteForm'), { ssr: false });
const OrganizationForm = dynamic(() => import('@/components/organizations/OrganizationForm'), { ssr: false });
const ContactForm = dynamic(() => import('@/components/contacts/ContactForm'), { ssr: false });
const ProductForm = dynamic(() => import('@/components/products/ProductForm'), { ssr: false });
const TicketForm = dynamic(() => import('@/components/tickets/TicketForm'), { ssr: false });
const PartnerCompanyForm = dynamic(() => import('@/components/partner-companies/PartnerCompanyForm'), { ssr: false });

/** The module's create form; every tab must be mounted (the organization form only mounts its active tab). */
function ModuleForm({ module }: { module: CrmModuleKey }) {
    switch (module) {
        case 'leads':
            return <LeadForm mode="create" />;
        case 'opportunities':
            return <OpportunityForm mode="create" />;
        case 'quotations':
            return <CreateQuoteForm mode="create" />;
        case 'organizations':
            return (
                <>
                    <OrganizationForm mode="create" initialTab="overview" />
                    <OrganizationForm mode="create" initialTab="address" />
                    <OrganizationForm mode="create" initialTab="tax_bank" />
                </>
            );
        case 'contacts':
            return <ContactForm mode="create" />;
        case 'products':
            return <ProductForm mode="create" />;
        case 'tickets':
            return <TicketForm mode="create" />;
        case 'partner-companies':
            return <PartnerCompanyForm mode="create" />;
        default:
            return null;
    }
}

/** A crash in the hidden copy must never take the form builder down; the editor then just starts blank. */
class SilentBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch() {
        /* intentionally ignored */
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}

const sameDefaults = (a: CodedFieldDefaultsMap, b: CodedFieldDefaultsMap) => {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((k) => a[k].placeholder === b[k]?.placeholder && a[k].hint === b[k]?.hint);
};

export interface CodedDefaultsHarvesterProps {
    module: CrmModuleKey;
    onChange: (defaults: CodedFieldDefaultsMap) => void;
}

/** Mount with `key={module}`, so each module starts from an empty record. */
export function CodedDefaultsHarvester({ module, onChange }: CodedDefaultsHarvesterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const recorded = useRef<CodedFieldDefaultsMap>({});
    const emitted = useRef<CodedFieldDefaultsMap>({});
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = useRef(onChange);
    useLayoutEffect(() => {
        onChangeRef.current = onChange;
    });

    const flush = useMemo(
        () => () => {
            timer.current = null;
            const result: CodedFieldDefaultsMap = {};
            for (const [key, value] of Object.entries(recorded.current)) result[key] = { ...value };
            // Controls that don't report themselves (plain inputs inside a FormField): read the rendered placeholder.
            containerRef.current?.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
                const key = el.dataset.field;
                if (!key || result[key]?.placeholder) return;
                const input = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]')].find(
                    (i) => i.closest('[data-field]') === el && i.type !== 'hidden' && i.placeholder.trim(),
                );
                if (input) result[key] = { ...result[key], placeholder: input.placeholder.trim() };
            });
            if (sameDefaults(result, emitted.current)) return;
            emitted.current = result;
            onChangeRef.current(result);
        },
        [],
    );

    const schedule = useMemo(
        () => () => {
            if (timer.current === null) timer.current = setTimeout(flush, 150);
        },
        [flush],
    );

    // Recorded during render: first reported value per text wins (the outermost control's coded prop).
    const recorder = useMemo<CodedDefaultsRecorder>(
        () => ({
            record(name: string, defaults: CodedFieldDefaults) {
                const current = recorded.current[name] ?? {};
                const next = {
                    placeholder: current.placeholder ?? defaults.placeholder,
                    hint: current.hint ?? defaults.hint,
                };
                if (next.placeholder === current.placeholder && next.hint === current.hint && name in recorded.current) return;
                recorded.current[name] = next;
                schedule();
            },
        }),
        [schedule],
    );

    // Lazy-loaded forms and async data keep adding fields after mount.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver(schedule);
        observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] });
        schedule();
        return () => {
            observer.disconnect();
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
        };
    }, [schedule]);

    return (
        <div ref={containerRef} aria-hidden style={{ display: 'none' }} inert>
            <SilentBoundary>
                <Suspense fallback={null}>
                    <CodedDefaultsRecorderProvider recorder={recorder}>
                        <ModuleForm module={module} />
                    </CodedDefaultsRecorderProvider>
                </Suspense>
            </SilentBoundary>
        </div>
    );
}
