'use client';

import { Box } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useFreshOnReturn } from '@/hooks/useFreshOnReturn';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { ContactsMasterView } from '@/components/contacts';

export default function ContactsPage() {
    const { user, loading, error, clearError } = useAuth();
    // Back from a record page (or any other page) shows the plain list, not the drawer left open before.
    const viewKey = useFreshOnReturn();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading contacts..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100dvh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />
            <ContactsMasterView key={viewKey} />
        </Box>
    );
}
