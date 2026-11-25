# Nandini CRM — Claude Code Instructions & Design System Guide

This monorepo contains:
- `frontend-crm`: Next.js 16 (App Router) + React 19 + MUI v9 (`@mui/material` with CSS variables enabled) + Tailwind CSS v4
- `backend-crm`: Express 5 + Prisma + SQL Server

## Architecture docs (keep them current)

`docs/` holds the living design docs: `system-design.md`, `database-design.md`, `api-plan.md`, `build-plan.md`.
Update the matching doc in the same change as the code: schema/migrations → database design; routes, params,
responses, error codes → API plan; Redis, queues, auth, env vars, deployment → system design; roadmap items →
build plan. See `docs/build-plan.md` Part 3.

Whenever creating or modifying UI components in `frontend-crm`, **you must strictly follow the Dual-Brand Color Theme System** documented below so Light Mode and Dark Mode remain 100% consistent, readable, and production-grade.

Anything new in `frontend-crm` must also be **fully responsive** (phone, tablet and desktop, touch included): see
[.claude/rules/responsive-ui.md](.claude/rules/responsive-ui.md).

---

## 1. Core Brand Identity: Light Mode = Blue, Dark Mode = Green

Nandini CRM uses a **dual-accent theme architecture**:
- **Light Mode (`.light` / `:root`)**: Brand Primary Accent is **Royal Blue** (`#2563EB` / `#1D4ED8`).
- **Dark Mode (`.dark`)**: Brand Primary Accent automatically switches to **Company Logo Green** (`#7ABD54` for text/icons/borders/outlines, and `#4F8A31` / `#417526` for solid button fills with white text).

Every interactive element that turns **Blue** in Light Mode (links, hover states, active tabs, filter pills, checkboxes, radios, switches, focus rings, primary buttons, avatars) **must turn Brand Green in Dark Mode**.

### Source of Truth Files
- `frontend-crm/src/theme/theme.ts`: MUI `createTheme` with `cssVariables: { colorSchemeSelector: 'class' }` and `light` / `dark` palettes (`--mui-palette-*`).
- `frontend-crm/src/theme/color-scale.css`: Semantic & accent scale tokens (`--crm-*`), where `--crm-blue-*`, `--crm-text-blue-*`, `--crm-fill-blue-*`, and `--crm-accent-rgb` automatically map to **Blue in `.light`** and **Green in `.dark`**.
- `frontend-crm/src/app/globals.css`: Global resets, scrollbars, and autofill overrides.

---

## 2. Token Reference (What to Use & Where)

### A. Surfaces & Backgrounds
| Role | Token to Use | Light Value | Dark Value |
| :--- | :--- | :--- | :--- |
| Page background | `var(--mui-palette-background-default)` | `#EEF2F7` | `#0B1120` |
| Card / Drawer / Modal / Table surface | `var(--mui-palette-background-paper)` | `#FFFFFF` | `#151E2E` |
| Table header / Section band / Subtle input | `var(--mui-palette-background-subtle)` | `#F8FAFC` | `#1A2436` |
| Neutral row / item hover | `var(--mui-palette-background-hover)` | `#F1F5F9` | `#223047` |
| Brand tinted surface (active pill, selected row, soft badge) | `var(--mui-palette-primary-soft)` | `#EFF6FF` | `#162620` |

### B. Typography & Icons
| Role | Token to Use | Light Value | Dark Value |
| :--- | :--- | :--- | :--- |
| Primary headings / strong values | `var(--crm-slate-900)` or `var(--mui-palette-text-primary)` | `#0F172A` / `#1E293B` | `#F1F5F9` / `#E2E8F0` |
| Body / secondary labels | `var(--mui-palette-text-secondary)` or `var(--crm-slate-600)` | `#64748B` / `#475569` | `#94A3B8` / `#A9B6C8` |
| Muted hints / placeholders / resting icons | `var(--mui-palette-text-muted)` | `#94A3B8` | `#64748B` |
| Brand accent text & icons (links, active icons, verified badges) | `var(--crm-text-blue-600)` or `var(--mui-palette-primary-main)` | `#2563EB` | `#7ABD54` |
| Brand link / button hover text | `var(--crm-text-blue-700)` | `#1D4ED8` | `#8FD16A` |
| High-emphasis active tab / pill title | `var(--crm-text-blue-900)` | `#1E3A8A` | `#C5EDAE` |

### C. Borders & Dividers
| Role | Token to Use | Light Value | Dark Value |
| :--- | :--- | :--- | :--- |
| Subtle divider | `var(--mui-palette-border-light)` | `#F1F5F9` | `#1E293B` |
| Standard card / input / table border | `var(--mui-palette-border-main)` | `#E2E8F0` | `#2A3649` |
| Emphasized / input hover border | `var(--mui-palette-border-strong)` | `#CBD5E1` | `#3B4A61` |
| Brand soft border (chips, active pills, hover outlines) | `var(--mui-palette-primary-softBorder)` or `var(--crm-blue-300)` | `#BFDBFE` / `#93C5FD` | `#2B4C3B` / `#3E6E52` |

### D. Solid Brand Fills (White `#FFFFFF` Text On Top)
Never use `var(--mui-palette-primary-main)` as a solid background with white text in dark mode (`#7ABD54` is tuned for text/icon legibility on dark surfaces). Always use `--crm-fill-blue-*` for solid fills that carry `#FFFFFF` text:
- **Primary Button / Avatar Gradient**:
  ```tsx
  background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
  color: '#ffffff',
  '&:hover': {
      background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
  }
  ```
- **Flat Solid Brand Button / Action Icon**:
  ```tsx
  backgroundColor: 'var(--crm-fill-blue-600)',
  color: '#ffffff',
  '&:hover': {
      backgroundColor: 'var(--crm-fill-blue-700)',
  }
  ```
- **Brand Translucent Glow / Shadow / Focus Ring**:
  ```tsx
  boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)'
  // or focus ring:
  boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)'
  ```

---

## 3. Standard Interactive & Hover Patterns

To keep hover behavior identical across the application (turning Blue in Light Mode and Green in Dark Mode):

1. **Outlined Secondary / Toolbar / Pagination Buttons & IconButtons**:
   ```tsx
   border: '1px solid var(--mui-palette-border-main)',
   color: 'var(--crm-slate-700)', // or 'var(--mui-palette-text-secondary)' for icon buttons
   backgroundColor: 'var(--mui-palette-background-paper)',
   transition: 'all 0.15s ease',
   '&:hover': {
       borderColor: 'var(--crm-blue-300)',
       backgroundColor: 'var(--mui-palette-primary-soft)',
       color: 'var(--crm-text-blue-700)',
   }
   ```
2. **Record Links (`<RecordLink>` or table links)**:
   - Use `<RecordLink>` from `@/components/common/RecordLink` with `color: 'var(--crm-text-blue-700)'`. It automatically underlines and transitions to `var(--crm-text-blue-600)` on hover in both modes.
3. **Tabs & Pill Tabs**:
   - Active tab: `backgroundColor: 'var(--mui-palette-background-paper)'`, `color: 'var(--crm-text-blue-900)'`, `border: '1px solid var(--mui-palette-border-strong)'`.
   - Inactive tab hover: `backgroundColor: 'var(--mui-palette-primary-soft)'`, `color: 'var(--crm-text-blue-700)'`.
4. **Destructive / Close Actions**:
   ```tsx
   '&:hover': {
       color: 'var(--mui-palette-error-main)',
       backgroundColor: 'var(--mui-palette-error-soft)',
       borderColor: 'var(--mui-palette-error-softBorder)',
   }
   ```

---

## 4. Strict Anti-Patterns (NEVER Do These)

1. **NEVER hardcode blue/sky/indigo/violet hex codes for brand UI elements** (e.g., `#2563eb`, `#1d4ed8`, `#0284c7`, `#0369a1`, `#6366f1`, `#4f46e5`, `#7c3aed`, `rgba(147,197,253,0.3)`). They will stay blue/purple in Dark Mode instead of switching to Brand Green.
2. **NEVER append hex alpha suffixes to CSS variables or dynamic color props** (e.g., ``backgroundColor: `${color}1a` `` or `` `${statusColor}0f` ``). When `color` is `var(--mui-palette-...)`, `${color}1a` produces invalid CSS (`var(--...)1a`) and renders transparent.
   - **Instead**, use semantic soft tokens (`var(--mui-palette-success-soft)`) or `color-mix`:
     ```tsx
     backgroundColor: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
     border: `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
     ```
3. **NEVER pair a hardcoded dark background (`#0f172a`, `#1e293b`, `#475569`) with inverted scale variables like `var(--crm-slate-200)` or `var(--crm-slate-300)` for text/icons**. In Dark Mode, `--crm-slate-200` (`#2A3649`) and `--crm-slate-300` (`#3B4A61`) are dark shades, resulting in unreadable dark-on-dark text! Always use `var(--mui-palette-background-subtle)` with `var(--crm-slate-900)` / `var(--mui-palette-text-secondary)`.
4. **NEVER set `background: 'linear-gradient(...)'` on a `<Button>` without an explicit `'&:hover': { background: 'linear-gradient(...)' }`**. Because `background` is a CSS shorthand, it overrides MUI's default `backgroundColor` hover state, causing the button not to change color at all on hover.
5. **NEVER remove `.light` from `color-scale.css`**: The PDF Template Builder canvas (`src/components/pdf/builder/canvas/Canvas.tsx`) intentionally wraps printable paper previews in `className="light"` so A4 document previews remain on white paper even when the app is in Dark Mode.

---

## 5. Module Identity Colors

Each CRM module has one identity hue, used only as a **light tint** to tell modules apart (global search results, nav menu dots, Quick Create icons, record drawer header strip). Tokens live in `color-scale.css` as `--crm-module-<key>-main|text|soft|border` with separate `.light` / `.dark` values; read them through `getModuleColor()` / `moduleForPath()` in `src/theme/moduleColors.ts`.

| Module | Hue | Module | Hue |
| :--- | :--- | :--- | :--- |
| Leads | Orange | Contacts | Pink |
| Opportunities | Violet | Tickets | Cyan |
| Quotations | Teal | Products | Gold |
| Organizations | Indigo | Partner Companies | Fuchsia |
| Contracts | Rose | Referrals | Emerald |
| Documents | Brown | Activities | Olive |

- Never use module colors for buttons, hover states, focus rings, checkboxes or links; those stay on the brand accent.
- `-main` for icons, dots and strips; `-soft` + `-border` for tinted tiles/badges with `-text` on top.
- Pass `module="<key>"` to `<EntityDetailDrawer>` to tint its header.
