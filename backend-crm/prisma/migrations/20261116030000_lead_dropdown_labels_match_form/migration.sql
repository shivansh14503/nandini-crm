BEGIN TRY

BEGIN TRAN;

-- The lead form's built-in dropdowns were named "Lead …" in the form builder while the form itself shows the field
-- names ("Designation", "Status", …). Rename them to match the form, leaving any name an admin has already changed.
UPDATE [dbo].[DropdownCategory] SET [label] = N'Status'            WHERE [key] = N'lead_status'            AND [label] = N'Lead Status';
UPDATE [dbo].[DropdownCategory] SET [label] = N'Designation'       WHERE [key] = N'lead_designation'       AND [label] = N'Lead Designation';
UPDATE [dbo].[DropdownCategory] SET [label] = N'Department'        WHERE [key] = N'lead_department'        AND [label] = N'Lead Department';
UPDATE [dbo].[DropdownCategory] SET [label] = N'Registration Type' WHERE [key] = N'lead_registration_type' AND [label] = N'Lead Registration Type';
UPDATE [dbo].[DropdownCategory] SET [label] = N'Turnover'          WHERE [key] = N'lead_turnover'          AND [label] = N'Lead Turnover Range';
UPDATE [dbo].[DropdownCategory] SET [label] = N'No of Employee'    WHERE [key] = N'lead_employee_range'    AND [label] = N'Lead Employee Range';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
