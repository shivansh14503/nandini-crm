# Frontend CRM — Claude Instructions

See the root [CLAUDE.md](../CLAUDE.md) and [.claude/rules/theme-and-styling.md](../.claude/rules/theme-and-styling.md) for the complete **Light Mode (Blue) / Dark Mode (Green)** design system, token reference table, hover patterns, and strict anti-patterns.

## Quick Checklist Before Submitting Any UI Change
- [ ] **No hardcoded brand hexes**: Did you use `--crm-fill-blue-*` for solid buttons/avatars, `--crm-text-blue-*` / `var(--mui-palette-primary-main)` for accent text/icons, and `rgb(var(--crm-accent-rgb) / ...)` for focus rings/shadows?
- [ ] **Matching hover states**: Do all buttons, icon buttons, links, and tabs have explicit hover styles that highlight in Blue (`.light`) and Green (`.dark`)?
- [ ] **No `${color}1a` alpha concatenation**: Did you use `color-mix(in srgb, ${color} 14%, transparent)` or `var(--mui-palette-*-soft)` instead of appending hex alpha to CSS variables?
- [ ] **Readable contrast in both modes**: Are all surfaces using `var(--mui-palette-background-paper)` / `var(--mui-palette-background-subtle)` and text using `var(--crm-slate-900)` / `var(--mui-palette-text-primary)` / `var(--mui-palette-text-secondary)`?

