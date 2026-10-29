import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/src/config/constants';

export default async function HomePage() {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (token) {
        redirect(ROUTES.DASHBOARD);
    }

    redirect(ROUTES.LOGIN);
}
