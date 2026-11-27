# Long Text Fields Have No Character Limit

Long text means descriptions, remarks, notes, terms and conditions, reasons (inactivity, escalation…), line item
Description / Note, ticket case notes, and any Form Builder "Long Text" (textarea) field. For every such field,
existing or new:

1. **No limit anywhere.** No `maxLength`, no counter, no `.max()` in Zod. Use `optionalLongText` /
   `requiredLongText` / `optionalDescription` from `validations/common.ts` (frontend) and `validators/common.ts`
   (backend), never `optionalText(field, max)`. Don't add a long text key to `FIELD_MAX_LENGTH`.
2. **Unlimited column.** Store it in `String? @db.NVarChar(Max)`, with a migration for an existing column. Add new
   columns to `LONG_TEXT_COLUMNS` in `backend-crm/src/validators/longTextLimits.test.ts`.
3. **One input.** Edit it with `RhfTextField multiline` (or `LongTextInput` outside React Hook Form): grows from 3 to 10
   lines then scrolls, no resize handle, expand button for a larger editor. Don't set `minRows` / `maxRows`.
4. **One display.** Show it with `ReadOnlyField` (clamps text by default) or `ClampedText`: 3 lines plus Show more.
   Long unbroken text must wrap (`overflow-wrap`); PDFs print it in full.
5. **Register it in the Form Builder** as a `textarea` field, like any new form field.

Short multi-line values that are not long text keep their limit and counter: street addresses, the public booking
page's visitor message, the Out of office message. See `docs/system-design.md` §8.11.
