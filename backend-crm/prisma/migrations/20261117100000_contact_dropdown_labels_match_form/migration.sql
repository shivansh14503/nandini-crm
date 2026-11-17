BEGIN TRY

BEGIN TRAN;

-- The contact form's Designation / Department dropdowns were named "Contact …" in the form builder while the form
-- shows "Designation" / "Department" (as on leads). Rename them to match, leaving any name an admin already changed.
UPDATE [dbo].[DropdownCategory] SET [label] = N'Designation' WHERE [key] = N'contact_designation' AND [label] = N'Contact Designation';
UPDATE [dbo].[DropdownCategory] SET [label] = N'Department'  WHERE [key] = N'contact_department'  AND [label] = N'Contact Department';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
