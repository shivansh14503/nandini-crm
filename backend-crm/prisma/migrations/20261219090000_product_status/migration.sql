-- Products: Status (Active / Inactive) replaces the isActive flag. Only Admins change it; making a product Inactive
-- asks for a reason, kept with the date / time and the admin's username until it is made Active again. Inactive
-- products are not offered in opportunity / quotation line items; lines that already carry one keep it.
--
-- Every existing product becomes Active (isActive was never editable, so all live products have isActive = 1); a row
-- that had isActive = 0 becomes Inactive since its last update, so nothing that was hidden reappears. The isActive
-- column (and its default constraint) is dropped. Nothing outside the Product table is changed: the `product_status`
-- dropdown and the Status field of the Form Builder are added by start-up seeding.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Product] ADD [status] NVARCHAR(30) NOT NULL CONSTRAINT [Product_status_df] DEFAULT 'Active',
[inactivityReason] NVARCHAR(500),
[inactiveSince] DATETIME2,
[inactivatedBy] NVARCHAR(50);

-- Dynamic SQL: the new columns don't exist yet when this batch is compiled.
EXEC(N'UPDATE [dbo].[Product] SET [status] = N''Inactive'', [inactiveSince] = [updatedAt], [inactivatedBy] = COALESCE([updatedBy], [createdBy]) WHERE [isActive] = 0;');

ALTER TABLE [dbo].[Product] DROP CONSTRAINT [Product_isActive_df];
ALTER TABLE [dbo].[Product] DROP COLUMN [isActive];

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_status_idx] ON [dbo].[Product]([status]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
