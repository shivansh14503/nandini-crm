-- Widen phone columns so E.164 numbers (max 15 digits + '+') fit without truncation.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Users] ALTER COLUMN [phone] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [mobile] NVARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [officePhone] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [phone3] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [phone4] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [phone5] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [mobile] NVARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [otherPhone] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [contactNumber] NVARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [contactMobile] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [contactNumber] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[PartnerCompany] ALTER COLUMN [phone] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[PartnerCompanyContact] ALTER COLUMN [mobile] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[PartnerCompanyContact] ALTER COLUMN [officePhone] NVARCHAR(20) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
