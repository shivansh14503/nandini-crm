BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Lead] ADD [tradeName] NVARCHAR(200);

-- A start-up seed may already have added the lead Trade Name field at the end of its section: slot it right after
-- Organization Name instead (sort orders are spaced by 10, so +5 sits between it and the next field).
UPDATE t
SET t.[sortOrder] = o.[sortOrder] + 5
FROM [dbo].[FormFieldDefinition] t
JOIN [dbo].[FormFieldDefinition] o
  ON o.[module] = t.[module] AND o.[fieldKey] = N'organizationName' AND o.[isSystem] = 1
 AND o.[tabKey] = t.[tabKey] AND o.[sectionKey] = t.[sectionKey]
WHERE t.[module] = N'leads' AND t.[fieldKey] = N'tradeName' AND t.[isSystem] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
