-- Opportunities: Commission becomes a fixed Yes / No dropdown (default No), and Yes asks for a Commission Amount.
-- Existing percentage options move over: a positive percentage ('Standard (10%)') becomes Yes with the amount it
-- worked out to (the deal's value before tax × the percentage, as the Commission Amount scorecard total showed);
-- anything else ('Nil / Direct (0%)', empty, or a deal with no value yet) becomes No.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] ADD [commissionAmount] DECIMAL(18,2) NULL;

-- Dynamic SQL: the new column doesn't exist yet when this batch is compiled.
EXEC(N'
UPDATE o
SET [commission] = CASE WHEN a.[amount] > 0 THEN N''Yes'' ELSE N''No'' END,
    [commissionAmount] = CASE WHEN a.[amount] > 0 THEN a.[amount] ELSE NULL END
FROM [dbo].[Opportunity] o
-- The number just before the first % sign (''Standard (10%)'' -> 10), or NULL when there is none.
CROSS APPLY (SELECT CASE WHEN CHARINDEX(N''%'', o.[commission]) > 1 THEN LEFT(o.[commission], CHARINDEX(N''%'', o.[commission]) - 1) END AS [head]) h
CROSS APPLY (SELECT PATINDEX(N''%[^0-9.]%'', REVERSE(h.[head]) + N''x'') - 1 AS [digits]) d
CROSS APPLY (SELECT CASE WHEN d.[digits] > 0 THEN TRY_CONVERT(DECIMAL(9,4), RIGHT(h.[head], d.[digits])) END AS [pct]) p
CROSS APPLY (SELECT ROUND(o.[subtotal] * ISNULL(p.[pct], 0) / 100, 0) AS [amount]) a
WHERE o.[commission] IS NULL OR o.[commission] NOT IN (N''Yes'', N''No'');
');

-- The dropdown keeps only Yes / No (system options), with No as the default.
DECLARE @cat NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'opportunity_commission');
IF @cat IS NOT NULL
BEGIN
    DELETE FROM [dbo].[DropdownOption] WHERE [categoryId] = @cat AND [value] NOT IN (N'Yes', N'No');

    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT CONVERT(NVARCHAR(50), NEWID()), @cat, v.[value], v.[value], NULL, v.[n] * 10, 1, 1, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM (VALUES (N'No', 1), (N'Yes', 2)) v([value], [n])
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] s WHERE s.[categoryId] = @cat AND s.[value] = v.[value]);

    UPDATE [dbo].[DropdownOption]
    SET [isSystem] = 1, [isActive] = 1, [isDefault] = CASE WHEN [value] = N'No' THEN 1 ELSE 0 END, [updatedAt] = SYSUTCDATETIME()
    WHERE [categoryId] = @cat;

    UPDATE [dbo].[DropdownCategory]
    SET [deletedAt] = NULL,
        [description] = N'Whether the opportunity pays a commission; Yes asks for the Commission Amount. Fixed options: No / Yes.',
        [updatedAt] = SYSUTCDATETIME()
    WHERE [id] = @cat;

    -- The built-in Commission field follows the list even if it was unlinked.
    UPDATE [dbo].[FormFieldDefinition] SET [dropdownCategoryId] = @cat, [updatedAt] = SYSUTCDATETIME()
    WHERE [module] = N'opportunities' AND [fieldKey] = N'commission' AND [isSystem] = 1 AND [dropdownCategoryId] IS NULL;
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
