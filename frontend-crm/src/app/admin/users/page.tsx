'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { UsersView } from '@/components/settings/users/UsersView';

/** Admin › Users: add, edit, reset passwords, deactivate / activate. Admin roles only. */
export default function AdminUsersPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading users..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Users' }]}
            deniedMessage="Only administrators can manage users. Ask an Admin or Super Admin for access."
        >
            <UsersView />
        </AdminPageShell>
    );
}
