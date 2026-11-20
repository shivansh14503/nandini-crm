-- Opportunity form: "Add Description" is now "Follow Up Remarks", and the separate "Description" field goes
-- (same as the lead form in 20261120120000_lead_follow_up_remarks).
-- Only the old default label is renamed, so a label an admin already changed stays as it is.
-- Description is deleted the way the form builder deletes a built-in field: a hidden, inactive tombstone
-- (so start-up seeding does not recreate it). Values already stored on opportunities are left untouched.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[FormFieldDefinition]
SET [label] = N'Follow Up Remarks', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'opportunities' AND [fieldKey] = N'addDescription' AND [label] = N'Add Description';

UPDATE [dbo].[FormFieldDefinition]
SET [isActive] = 0,
    [isVisibleInForm] = 0,
    [isVisibleInDrawer] = 0,
    [isRequired] = 0,
    [dropdownCategoryId] = NULL,
    [validationRulesJson] = N'{"_deleted":true}',
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'opportunities' AND [fieldKey] = N'description' AND [isSystem] = 1 AND [isCoreLocked] = 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
