import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Dark mode: colors must come from theme tokens (var(--mui-palette-*) / var(--crm-*) / palette paths),
  // not hex literals, or they won't change with the color scheme. White is allowed (text on solid fills).
  // Solid fills that intentionally look the same in both themes can opt out with an eslint-disable comment.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/components/pdf/builder/canvas/**",
      "src/components/pdf/builder/richtext/**",
      "src/components/pdf/builder/layouts.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Property[key.name=/^(color|bgcolor|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline|outlineColor|fill|stroke)$/] Literal[value=/#(?!(?:fff|ffffff)\\b)[0-9a-fA-F]{3,8}\\b/i]",
          message:
            "Hardcoded hex color won't follow dark mode. Use a theme token, e.g. 'var(--mui-palette-text-secondary)', 'var(--mui-palette-border-main)' or 'var(--crm-blue-700)' (see src/theme/color-scale.css).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
