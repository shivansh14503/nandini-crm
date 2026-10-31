-- Partner Company becomes a full CRM record (form, master view, soft delete, audit).
-- Every new column is nullable or has a default, so existing / seeded rows migrate as-is.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[PartnerCompany] ADD
    [website] NVARCHAR(200),
    [addDescription] NVARCHAR(2000),
    [description] NVARCHAR(2000),
    [principalCompany] NVARCHAR(200),
    [emailAddressesJson] NVARCHAR(max),
    [bankName] NVARCHAR(100),
    [bankBranch] NVARCHAR(150),
    [accountNumber] NVARCHAR(18),
    [bankIfscCode] NVARCHAR(11),
    [billingAddress] NVARCHAR(250),
    [billingStreet] NVARCHAR(250),
    [billingCity] NVARCHAR(80),
    [billingState] NVARCHAR(80),
    [billingPostalCode] NVARCHAR(12),
    [shippingAddress] NVARCHAR(250),
    [shippingStreet] NVARCHAR(250),
    [shippingCity] NVARCHAR(80),
    [shippingState] NVARCHAR(80),
    [shippingPostalCode] NVARCHAR(12),
    [shippingCountry] NVARCHAR(80),
    [copyAddressFromBilling] BIT NOT NULL CONSTRAINT [PartnerCompany_copyAddressFromBilling_df] DEFAULT 0,
    [gstNo] NVARCHAR(15),
    [panNumber] NVARCHAR(10),
    [cinNo] NVARCHAR(21),
    [msmeRegnNumber] NVARCHAR(19),
    [tanNumber] NVARCHAR(10),
    [createdBy] NVARCHAR(50) NOT NULL CONSTRAINT [PartnerCompany_createdBy_df] DEFAULT 'system',
    [updatedBy] NVARCHAR(50),
    [isDeleted] BIT NOT NULL CONSTRAINT [PartnerCompany_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2;

CREATE NONCLUSTERED INDEX [PartnerCompany_isDeleted_createdAt_idx] ON [dbo].[PartnerCompany]([isDeleted], [createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
