import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_HEX_COLOR = {
  selector:
    "Property[key.name=/^(color|bgcolor|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline|outlineColor|fill|stroke)$/] Literal[value=/#(?!(?:fff|ffffff)\\b)[0-9a-fA-F]{3,8}\\b/i]",
  message:
    "Hardcoded hex color won't follow dark mode. Use a theme token, e.g. 'var(--mui-palette-text-secondary)', 'var(--mui-palette-border-main)' or 'var(--crm-blue-700)' (see src/theme/color-scale.css).",
};

// `['Services', 'AMC'].includes(record.category)`: a filter over hand-written dropdown values.
const NO_HARDCODED_PILL_OPTIONS = {
  selector: "CallExpression[callee.property.name='includes'][callee.object.type='ArrayExpression'][callee.object.elements.0.type='Literal']",
  message:
    "Filter pills must not match records against a hand-written list of dropdown values: removing the option in Admin › Dropdown Manager would leave the pill behind. Build the pill from useDropdownPillOptions (src/components/common/filterPills) or a named constant of system options.",
};

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
    rules: { "no-restricted-syntax": ["warn", NO_HEX_COLOR] },
  },
  // List screens: quick-view filter pills must follow the admin's dropdowns (useDropdownPillOptions), never a
  // hand-written list of option values, or a removed option keeps its pill. Flat config replaces a rule's options
  // per file, so the hex check is repeated here.
  {
    files: ["src/components/**/*MasterView.tsx", "src/components/**/master/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", NO_HEX_COLOR, NO_HARDCODED_PILL_OPTIONS] },
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
