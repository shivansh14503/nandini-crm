-- The opportunity's Type dropdown is listed as "Type", the same name the field has on the form and in Form Builder
-- (it was "Opportunity Type"). A name an admin chose is left alone.
UPDATE [dbo].[DropdownCategory]
SET [label] = N'Type', [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'opportunity_type' AND [label] = N'Opportunity Type';
