# Filter Pills Follow the Dropdowns

When dropdown options change (added, removed / archived, renamed or reordered in Admin › Dropdown Manager or the
Form Builder), every filter pill, scorecard card and Filter dialog option built on that dropdown must change with
them, from the same source:

1. Build pills that filter by a dropdown value with `useDropdownPillOptions(categoryKey, module)` from
   `frontend-crm/src/components/common/filterPills`: one pill per active option, or a fixed pill that is shown only
   while `find(value)` returns its option, labelled with the option's label. Match records with `sameOption`.
2. Never hand-write option values in a list screen (`['Services', 'AMC'].includes(p.category)`). ESLint rejects it
   in `*MasterView.tsx` and `master/**`. The only values code may name are system options (`isSystem`, which an
   admin can't remove), kept in a named constant (e.g. `CLOSED_STAGES`).
3. A selected pill whose option disappears falls back to the "All" view; records still holding a removed value stay
   in "All" and in their drawer.
4. When you change a dropdown's options in code (defaults, migrations, seeds), check its pills and scorecards on
   every list that uses that dropdown.

See `docs/system-design.md` §8.2 "Filter pills follow the dropdowns".
