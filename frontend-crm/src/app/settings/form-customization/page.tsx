import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/constants';

/** Form Customization moved under Admin; keeps old links and bookmarks working. */
export default function LegacyFormCustomizationPage() {
    redirect(ROUTES.FORM_CUSTOMIZATION);
}
