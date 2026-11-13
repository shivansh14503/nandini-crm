BEGIN TRY

BEGIN TRAN;

-- The lead GST Number field was added after the ORGANIZATION section existed, so start-up seeding appended it to
-- the section's end. Slot it right after Registration Type (sort orders are spaced by 10; +5 sits in between).
UPDATE g
SET g.[sortOrder] = r.[sortOrder] + 5
FROM [dbo].[FormFieldDefinition] g
JOIN [dbo].[FormFieldDefinition] r
  ON r.[module] = g.[module] AND r.[fieldKey] = N'registrationType' AND r.[isSystem] = 1
 AND r.[tabKey] = g.[tabKey] AND r.[sectionKey] = g.[sectionKey]
WHERE g.[module] = N'leads' AND g.[fieldKey] = N'gstNo' AND g.[isSystem] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
