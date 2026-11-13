-- Organizations' "Source of Lead" now uses the lead form's Lead Source dropdown (shared_lead_source) and is
-- labelled "Lead Source". The organization-only dropdown (org_source_of_lead) is folded into it and removed.
BEGIN TRY

BEGIN TRAN;

DECLARE @shared NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'shared_lead_source' AND [deletedAt] IS NULL);
DECLARE @org NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'org_source_of_lead');

IF @shared IS NOT NULL
BEGIN
    IF @org IS NOT NULL
    BEGIN
        -- Keep values only the organization list had (admin-added), so stored organization values still render.
        DECLARE @maxSort INT = (SELECT ISNULL(MAX([sortOrder]), 0) FROM [dbo].[DropdownOption] WHERE [categoryId] = @shared);
        INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
        SELECT CONVERT(NVARCHAR(50), NEWID()), @shared, o.[value], o.[label], o.[metaJson],
               @maxSort + 10 * ROW_NUMBER() OVER (ORDER BY o.[sortOrder], o.[value]),
               o.[isActive], 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
        FROM [dbo].[DropdownOption] o
        WHERE o.[categoryId] = @org
          AND NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] s WHERE s.[categoryId] = @shared AND s.[value] = o.[value]);

        -- Every field linked to the organization list (the built-in Source of Lead and any custom field) moves over.
        UPDATE [dbo].[FormFieldDefinition] SET [dropdownCategoryId] = @shared, [updatedAt] = SYSUTCDATETIME()
        WHERE [dropdownCategoryId] = @org;

        DELETE FROM [dbo].[DropdownCategory] WHERE [id] = @org; -- options cascade
    END;

    -- The built-in organization field follows the shared list even if it was unlinked.
    UPDATE [dbo].[FormFieldDefinition] SET [dropdownCategoryId] = @shared, [updatedAt] = SYSUTCDATETIME()
    WHERE [module] = N'organizations' AND [fieldKey] = N'sourceOfLead' AND [isSystem] = 1 AND [dropdownCategoryId] IS NULL;

    UPDATE [dbo].[DropdownCategory]
    SET [description] = N'Where a lead, opportunity or organization came from (Leads, Opportunities, Organizations).', [updatedAt] = SYSUTCDATETIME()
    WHERE [id] = @shared;
END;

-- Rename the organization field (an admin's own custom label is kept).
UPDATE [dbo].[FormFieldDefinition] SET [label] = N'Lead Source', [updatedAt] = SYSUTCDATETIME()
WHERE [module] = N'organizations' AND [fieldKey] = N'sourceOfLead' AND [isSystem] = 1 AND [label] = N'Source of Lead';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
