BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[City] ADD [isHidden] BIT NOT NULL CONSTRAINT [City_isHidden_df] DEFAULT 0,
[seedKey] NVARCHAR(200);

-- AlterTable
ALTER TABLE [dbo].[Lead] ADD [otherCityId] INT,
[primaryCityId] INT;

-- AlterTable
ALTER TABLE [dbo].[Organization] ADD [billingCityId] INT,
[shippingCityId] INT;

-- AlterTable
ALTER TABLE [dbo].[PartnerCompany] ADD [billingCityId] INT,
[shippingCityId] INT;

-- AlterTable
ALTER TABLE [dbo].[Quotation] ADD [billingCityId] INT,
[shippingCityId] INT;

-- CreateIndex
CREATE NONCLUSTERED INDEX [City_seedKey_idx] ON [dbo].[City]([seedKey]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_primaryCityId_idx] ON [dbo].[Lead]([primaryCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_otherCityId_idx] ON [dbo].[Lead]([otherCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_billingCityId_idx] ON [dbo].[Organization]([billingCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_shippingCityId_idx] ON [dbo].[Organization]([shippingCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartnerCompany_billingCityId_idx] ON [dbo].[PartnerCompany]([billingCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartnerCompany_shippingCityId_idx] ON [dbo].[PartnerCompany]([shippingCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_billingCityId_idx] ON [dbo].[Quotation]([billingCityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_shippingCityId_idx] ON [dbo].[Quotation]([shippingCityId]);

-- AddForeignKey
ALTER TABLE [dbo].[Organization] ADD CONSTRAINT [Organization_billingCityId_fkey] FOREIGN KEY ([billingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Organization] ADD CONSTRAINT [Organization_shippingCityId_fkey] FOREIGN KEY ([shippingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_primaryCityId_fkey] FOREIGN KEY ([primaryCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_otherCityId_fkey] FOREIGN KEY ([otherCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_billingCityId_fkey] FOREIGN KEY ([billingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_shippingCityId_fkey] FOREIGN KEY ([shippingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PartnerCompany] ADD CONSTRAINT [PartnerCompany_billingCityId_fkey] FOREIGN KEY ([billingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PartnerCompany] ADD CONSTRAINT [PartnerCompany_shippingCityId_fkey] FOREIGN KEY ([shippingCityId]) REFERENCES [dbo].[City]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
