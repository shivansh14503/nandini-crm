import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/constants';

// Only ever redirects, so there is nothing to validate for instant navigation (the redirect would
// otherwise surface in dev as "Could not validate `instant`"). Same as the root page.
export const instant = false;

/** Form Customization moved under Admin; keeps old links and bookmarks working. */
export default function LegacyFormCustomizationPage() {
    redirect(ROUTES.FORM_CUSTOMIZATION);
}
