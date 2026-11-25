-- Leads and opportunities: Referred By is shown, and required, when Lead Source is CA or Reference; a Nature of
-- Partner (the shared partner_nature list, as on partner organizations) is shown, and required, when Lead Source is
-- Partner. Start-up seeding adds the CA / Reference / Partner Lead Source options (system options: the rules depend
-- on them) and the Nature of Partner field after Referred By.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Lead] ADD [natureOfPartner] NVARCHAR(100) NULL;
ALTER TABLE [dbo].[Opportunity] ADD [natureOfPartner] NVARCHAR(100) NULL;

UPDATE [dbo].[DropdownCategory]
SET [description] = N'Kind of partner (Partner Companies, Organizations whose Customer Type is Partner, and Leads / Opportunities whose Lead Source is Partner).',
    [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'partner_nature';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
