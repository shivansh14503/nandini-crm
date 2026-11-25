-- Leads get their own Customer Response list (`lead_customer_response`, seeded at start-up with its options and their
-- Rating rules). The field stays the same on both forms (key `customerResponse`, same follow-up flow); only the list
-- differs per module, like Status. Opportunities keep `shared_customer_response` as it is.
--
-- Unlinking the leads field here lets start-up seeding link it to the new list (seeding links a built-in field that
-- has no list to its default one). A field an admin linked to some other list is left alone. Stored responses on
-- lead records are history and keep their text.
BEGIN TRY

BEGIN TRAN;

UPDATE f
SET [dropdownCategoryId] = NULL, [updatedAt] = SYSUTCDATETIME()
FROM [dbo].[FormFieldDefinition] f
INNER JOIN [dbo].[DropdownCategory] c ON c.[id] = f.[dropdownCategoryId]
WHERE f.[module] = N'leads' AND f.[fieldKey] = N'customerResponse' AND c.[key] = N'shared_customer_response';

UPDATE [dbo].[DropdownCategory]
SET [description] = N'What the customer said on the last follow-up (Opportunities). Leads have their own list.',
    [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'shared_customer_response';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
