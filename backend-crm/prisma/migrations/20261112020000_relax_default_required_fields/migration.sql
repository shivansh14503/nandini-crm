-- Field locking policy (docs/field-locking-policy.md): fields an admin may now make optional in the form builder
-- become nullable. Whether they are required is enforced from the form configuration, not the column.
-- Indexed columns are re-indexed around the change (SQL Server can't alter a column an index depends on).
BEGIN TRY

BEGIN TRAN;

-- DropIndex
DROP INDEX [Lead_mobile_idx] ON [dbo].[Lead];
DROP INDEX [Lead_nextFollowupDate_idx] ON [dbo].[Lead];
DROP INDEX [Opportunity_nextFollowupDate_idx] ON [dbo].[Opportunity];
DROP INDEX [Ticket_ticketPriority_idx] ON [dbo].[Ticket];

-- AlterTable
ALTER TABLE [dbo].[Lead] ALTER COLUMN [mobile] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [leadSource] NVARCHAR(50) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [productCategoryJson] NVARCHAR(max) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [addDescription] NVARCHAR(2000) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [leadType] NVARCHAR(30) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [nextFollowupDate] DATE NULL;

-- AlterTable
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [productCategoryJson] NVARCHAR(max) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [type] NVARCHAR(50) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [leadSource] NVARCHAR(50) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [leadGivenBy] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [nextFollowupDate] DATE NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [addDescription] NVARCHAR(2000) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [commission] NVARCHAR(50) NULL;

-- AlterTable
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [termsAndCondition] NVARCHAR(100) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [validationPeriod] NVARCHAR(30) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [paymentTerms] NVARCHAR(100) NULL;

-- AlterTable
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [ticketPriority] NVARCHAR(20) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [supportMode] NVARCHAR(50) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [natureOfCall] NVARCHAR(100) NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_mobile_idx] ON [dbo].[Lead]([mobile]);
CREATE NONCLUSTERED INDEX [Lead_nextFollowupDate_idx] ON [dbo].[Lead]([nextFollowupDate]);
CREATE NONCLUSTERED INDEX [Opportunity_nextFollowupDate_idx] ON [dbo].[Opportunity]([nextFollowupDate]);
CREATE NONCLUSTERED INDEX [Ticket_ticketPriority_idx] ON [dbo].[Ticket]([ticketPriority]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
