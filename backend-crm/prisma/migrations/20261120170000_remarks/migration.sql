-- Leads and opportunities: "Follow Up Remarks" is now "Remarks", and its backend name follows (followUpRemarks → remarks,
-- the same name quotations use). The column is renamed in place (data kept); the form field key, its default label,
-- saved table filters, list scorecards and audit diffs (which the follow-up history reads) follow.
-- Only the old default label is renamed, so a label an admin already changed stays as it is.
BEGIN TRY

BEGIN TRAN;

EXEC sp_rename N'dbo.Lead.followUpRemarks', N'remarks', N'COLUMN';
EXEC sp_rename N'dbo.Opportunity.followUpRemarks', N'remarks', N'COLUMN';

-- A server started on the new code before this migration seeds `remarks` as a fresh built-in row: drop it, the
-- existing row (with the admin's settings) takes the name.
DELETE n
FROM [dbo].[FormFieldDefinition] n
WHERE n.[module] IN (N'leads', N'opportunities') AND n.[fieldKey] = N'remarks'
  AND EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] o WHERE o.[module] = n.[module] AND o.[fieldKey] = N'followUpRemarks');

UPDATE [dbo].[FormFieldDefinition]
SET [fieldKey] = N'remarks', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] IN (N'leads', N'opportunities') AND [fieldKey] = N'followUpRemarks';

UPDATE [dbo].[FormFieldDefinition]
SET [label] = N'Remarks', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] IN (N'leads', N'opportunities') AND [fieldKey] = N'remarks' AND [label] = N'Follow Up Remarks';

UPDATE [dbo].[ModuleScorecard]
SET [fieldKey] = N'remarks'
WHERE [module] IN (N'leads', N'opportunities') AND [fieldKey] = N'followUpRemarks';

UPDATE [dbo].[TableFilter]
SET [criteriaJson] = REPLACE([criteriaJson], N'"followUpRemarks"', N'"remarks"')
WHERE [module] IN (N'leads', N'opportunities') AND [criteriaJson] LIKE N'%"followUpRemarks"%';

UPDATE [dbo].[AuditLog]
SET [changesJson] = REPLACE([changesJson], N'"followUpRemarks"', N'"remarks"')
WHERE [entityType] IN (N'Lead', N'Opportunity') AND [changesJson] LIKE N'%"followUpRemarks"%';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
