'use client';

import React, { createContext, useContext, useMemo } from 'react';

export type FormMode = 'create' | 'edit' | 'view';

interface FormModeContextValue {
    mode: FormMode;
}

const FormModeContext = createContext<FormModeContextValue>({ mode: 'create' });

/** Tells shared form primitives (FormField, StyledSelect, EmailRow…) whether to render inputs or read-only values. */
export function FormModeProvider({ mode, children }: { mode: FormMode; children: React.ReactNode }) {
    const value = useMemo(() => ({ mode }), [mode]);
    return <FormModeContext.Provider value={value}>{children}</FormModeContext.Provider>;
}

export function useFormMode(): FormModeContextValue {
    return useContext(FormModeContext);
}
