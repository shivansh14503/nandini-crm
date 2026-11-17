# Frontend Theme & Color Consistency Rules

Whenever writing or modifying frontend code in `frontend-crm/src`:

1. **Light Mode = Blue (`#2563EB`), Dark Mode = Green (`#7ABD54`)**:
   - Never hardcode hex colors (`#2563eb`, `#1d4ed8`, `#0284c7`, `#6366f1`, `#1e293b`, `#ffffff`, `#0f172a`) for surfaces, text, icons, avatars, or focus rings.
   - Use `--crm-text-blue-600/700/800/900` or `var(--mui-palette-primary-main)` for brand-colored text and icons.
   - Use `--crm-fill-blue-600/700/800` for solid brand backgrounds/gradients that have `#ffffff` text on top.
   - Use `rgb(var(--crm-accent-rgb) / <alpha>)` for brand glows, shadows, and focus rings.

2. **Consistent Hover States**:
   - Every interactive element that turns blue on hover in Light Mode must turn green on hover in Dark Mode.
   - For outlined/secondary/toolbar buttons and icon buttons, use:
     `&:hover: { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' }`.
   - For gradient primary buttons, always include a matching `'&:hover'` `background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)'`.

3. **No Invalid Alpha Concatenations or Dark-on-Dark Text**:
   - Never write `` `${color}1a` `` or `` `${color}0f` `` on a CSS variable string; use `color-mix(in srgb, ${color} 14%, transparent)` or `var(--mui-palette-*-soft)`.
   - Never use `var(--crm-slate-200)` or `var(--crm-slate-300)` as light text on a dark banner (in `.dark`, `200` and `300` are dark border shades).

