-- Organizations' "Registration Type" now uses the lead form's Registration Type dropdown. The lead list
-- (lead_registration_type) becomes the shared list (shared_registration_type); the organization-only list
-- (org_registration_type) is folded into it and removed. 'Registered' / 'Unregistered' stay system options:
-- 'Registered' is what makes a GSTIN required on both forms.
BEGIN TRY

BEGIN TRAN;

DECLARE @shared NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'shared_registration_type');
DECLARE @lead NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'lead_registration_type' AND [deletedAt] IS NULL);
DECLARE @org NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'org_registration_type');

-- The lead list becomes the shared one (its options, order, labels and default are kept). If an admin deleted the
-- lead list, the organization list is kept instead.
IF @shared IS NULL
BEGIN
    SET @shared = ISNULL(@lead, (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [id] = @org AND [deletedAt] IS NULL));
    IF @shared IS NOT NULL
        UPDATE [dbo].[DropdownCategory]
        SET [key] = N'shared_registration_type', [label] = N'Registration Type', [module] = N'shared',
            [description] = N'GST registration of a lead or organization (Leads, Organizations). ''Registered'' requires a GSTIN.',
            [updatedAt] = SYSUTCDATETIME()
        WHERE [id] = @shared;
END;

IF @shared IS NOT NULL
BEGIN
    -- Folds a retired list into the shared one: values only it had (admin-added) are kept so stored values still
    -- render, every field linked to it (built-in or custom) moves over, and the list is removed (options cascade).
    -- The lead list is only folded here when the start-up seed created the shared list before this migration ran.
    DECLARE @retired TABLE ([id] NVARCHAR(50));
    INSERT INTO @retired ([id]) SELECT [id] FROM [dbo].[DropdownCategory]
    WHERE [id] IN (@lead, @org) AND [id] <> @shared;

    DECLARE @maxSort INT = (SELECT ISNULL(MAX([sortOrder]), 0) FROM [dbo].[DropdownOption] WHERE [categoryId] = @shared);
    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT CONVERT(NVARCHAR(50), NEWID()), @shared, o.[value], MIN(o.[label]), MIN(o.[metaJson]),
           @maxSort + 10 * ROW_NUMBER() OVER (ORDER BY MIN(o.[sortOrder]), o.[value]),
           MAX(CAST(o.[isActive] AS INT)), 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM [dbo].[DropdownOption] o
    WHERE o.[categoryId] IN (SELECT [id] FROM @retired)
      AND NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] s WHERE s.[categoryId] = @shared AND s.[value] = o.[value])
    GROUP BY o.[value];

    UPDATE [dbo].[FormFieldDefinition] SET [dropdownCategoryId] = @shared, [updatedAt] = SYSUTCDATETIME()
    WHERE [dropdownCategoryId] IN (SELECT [id] FROM @retired);

    DELETE FROM [dbo].[DropdownCategory] WHERE [id] IN (SELECT [id] FROM @retired);

    -- Both built-in fields follow the shared list even if they were unlinked.
    UPDATE [dbo].[FormFieldDefinition] SET [dropdownCategoryId] = @shared, [updatedAt] = SYSUTCDATETIME()
    WHERE [module] IN (N'leads', N'organizations') AND [fieldKey] = N'registrationType' AND [isSystem] = 1 AND [dropdownCategoryId] IS NULL;

    -- 'Registered' / 'Unregistered' drive the GSTIN rules: present, active and system.
    DECLARE @sort INT = (SELECT ISNULL(MAX([sortOrder]), 0) FROM [dbo].[DropdownOption] WHERE [categoryId] = @shared);
    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT CONVERT(NVARCHAR(50), NEWID()), @shared, v.[value], v.[value], NULL, @sort + v.[n] * 10, 1, 1, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM (VALUES (N'Registered', 1), (N'Unregistered', 2)) v([value], [n])
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] s WHERE s.[categoryId] = @shared AND s.[value] = v.[value]);

    UPDATE [dbo].[DropdownOption] SET [isSystem] = 1, [isActive] = 1, [updatedAt] = SYSUTCDATETIME()
    WHERE [categoryId] = @shared AND [value] IN (N'Registered', N'Unregistered');
END;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
