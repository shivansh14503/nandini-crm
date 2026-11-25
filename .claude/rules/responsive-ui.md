# Responsive UI for Everything New

Every new screen, panel, dialog, drawer or component in `frontend-crm/src` must work on phones, tablets and
desktops from the start. Changes to existing UI must not make it less responsive than it was.

1. **Check three widths**: phone (360–414 px), tablet (768–1024 px) and desktop (1280 px and up). Nothing may
   overflow sideways at any of them: no horizontal page scroll, no clipped buttons, no text running off a card.
2. **Use MUI breakpoints** (`xs` < 600, `sm` 600, `md` 900, `lg` 1200, `xl` 1536) through responsive `sx` values
   (`{ xs: 1.5, md: 3 }`, `display: { xs: 'none', md: 'flex' }`) or `useMediaQuery(theme.breakpoints…)` when the
   structure itself changes. Don't hardcode pixel widths for containers; use `maxWidth`, `minWidth: 0`, `flex`,
   `flexWrap` and `minmax(0, 1fr)` grid columns so content can shrink.
3. **Multi-pane layouts collapse**: three panes on desktop, two on tablet, one column on phones. Side panels on
   phones become a collapsible section, tabs, or a bottom sheet (`Drawer anchor="bottom"`).
4. **Touch works**: tap targets at least 32 px (40 px preferred); nothing is reachable by hover alone (hover-only
   handles and actions must also show or work on tap). Drag and drop must work on touch while a swipe still
   scrolls (a dnd-kit `TouchSensor` with a short press delay, or touch drags that start only from a grip with
   `touch-action: none`, as `useDragReorder` and the Drawer Layout builder do) **and** have a non-drag way to do
   the same thing (an add button, move up / down buttons).
5. **Tables and wide content** scroll inside their own container (`overflowX: 'auto'`), never the page. Toolbars
   wrap (`flexWrap: 'wrap'`) instead of overflowing.
6. **Dialogs and drawers** fit a phone screen: full width minus a small margin, content scrolls inside.
7. Before calling the work done, look at it at the three widths in both light and dark mode (screenshots in the
   PR when the change is visual).

> **For now (until the project owner says otherwise): skip the step 7 check.** Don't spend time looking at the
> phone, tablet and desktop widths or taking width screenshots before finishing. Still write the UI with the
> responsive patterns above (breakpoints, wrapping, `overflowX: 'auto'`, `minWidth: 0`).
