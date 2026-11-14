'use client';

import React, { createContext, useContext } from 'react';

/**
 * The texts a hand-built form codes for a built-in field (what it shows when the admin hasn't overridden them).
 * The form builder reads them so its field editor starts from what the form really shows instead of blank boxes.
 */
export interface CodedFieldDefaults {
    placeholder?: string;
    hint?: string;
}

/** Coded defaults of one module's built-in fields, by field key (React Hook Form name). */
export type CodedFieldDefaultsMap = Record<string, CodedFieldDefaults>;

/**
 * Set only around the hidden copy of a module form the form builder mounts to read its coded texts: field
 * primitives report the props they were given, admin overrides are not applied (so the form renders exactly as
 * coded) and the form's unsaved-changes guard stays off.
 */
export interface CodedDefaultsRecorder {
    record: (name: string, defaults: CodedFieldDefaults) => void;
}

const RecorderContext = createContext<CodedDefaultsRecorder | null>(null);

export function CodedDefaultsRecorderProvider({ recorder, children }: { recorder: CodedDefaultsRecorder; children: React.ReactNode }) {
    return <RecorderContext.Provider value={recorder}>{children}</RecorderContext.Provider>;
}

/** The recorder when rendering inside the form builder's hidden harvest copy of a form, else null. */
export function useCodedDefaultsRecorder(): CodedDefaultsRecorder | null {
    return useContext(RecorderContext);
}

const DefaultsContext = createContext<CodedFieldDefaultsMap>({});

/** Provides the coded defaults of the module open in the form builder. */
export function CodedFieldDefaultsProvider({ value, children }: { value: CodedFieldDefaultsMap; children: React.ReactNode }) {
    return <DefaultsContext.Provider value={value}>{children}</DefaultsContext.Provider>;
}

/** Coded placeholder / hint of a built-in field (empty outside the form builder or before the form was read). */
export function useCodedFieldDefaults(fieldKey: string | undefined): CodedFieldDefaults {
    const map = useContext(DefaultsContext);
    return (fieldKey && map[fieldKey]) || EMPTY;
}

const EMPTY: CodedFieldDefaults = {};
