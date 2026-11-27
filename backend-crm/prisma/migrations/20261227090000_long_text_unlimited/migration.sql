-- Long text fields have no character limit (descriptions, remarks, notes, terms, reasons, line item description / note,
-- ticket case notes, the booking link note): their columns become NVARCHAR(MAX). Widening keeps every stored value and
-- each column's NULL / NOT NULL; none of them is indexed or has a default.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Organization] ALTER COLUMN [inactivityReason] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Organization] ALTER COLUMN [addDescriptionAndScope] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Contact] ALTER COLUMN [addDescription] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [remarks] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Lead] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Product] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Product] ALTER COLUMN [termsAndConditions] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Product] ALTER COLUMN [inactivityReason] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [remarks] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[OpportunityLineItem] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[OpportunityLineItem] ALTER COLUMN [note] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [remarks] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [termsAndConditionDescription] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [paymentTermsDescription] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [notes] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [termsAndConditions] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[QuotationLineItem] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[QuotationLineItem] ALTER COLUMN [note] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [problemReported] NVARCHAR(MAX) NOT NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [problemObserved] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [resolution] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [reasonForEscalatedCalls] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [rca] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [addDescription] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Contract] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[Activity] ALTER COLUMN [remarks] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[PartnerCompany] ALTER COLUMN [addDescription] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[PartnerCompany] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[BookingLink] ALTER COLUMN [note] NVARCHAR(MAX) NULL;
COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
