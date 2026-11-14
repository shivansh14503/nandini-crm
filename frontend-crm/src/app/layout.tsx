import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { QueryProvider } from "@/context/QueryProvider";
import { AuthProvider } from "@/context/AuthContext";
import { CrmDataBootstrap } from "@/components/common/CrmDataBootstrap";
import { EnterTogglesCheckboxes } from "@/components/common/EnterTogglesCheckboxes";
import { APP_CONFIG } from "@/config/constants";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { COLOR_SCHEME_DEFAULT_MODE, COLOR_SCHEME_STORAGE_KEY } from "@/theme/colorScheme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_CONFIG.appName,
  description: `Official CRM portal for ${APP_CONFIG.companyName}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // InitColorSchemeScript adds the `.light` / `.dark` class before React hydrates.
      suppressHydrationWarning
    >
      <body className="min-h-full m-0">
        <InitColorSchemeScript
          attribute="class"
          defaultMode={COLOR_SCHEME_DEFAULT_MODE}
          modeStorageKey={COLOR_SCHEME_STORAGE_KEY}
        />
        <ThemeRegistry>
          <QueryProvider>
            <AuthProvider>
              <CrmDataBootstrap />
              <EnterTogglesCheckboxes />
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
