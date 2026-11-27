import type { Metadata } from 'next';

/**
 * /set-password opens from an emailed invite or reset link whose token is in the URL: the page never sends it on as a
 * referrer, and search engines never index it.
 */
export const metadata: Metadata = {
    title: 'Set your password',
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
};

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
}
