-- Products (Jira CRM-15 Product Catalog):
--  • Category becomes Product Category: the [category] column is renamed [productCategory] (same values, still one
--    option of the shared Product Category dropdown), so the field has the label and key it has on Leads and
--    Opportunities. The Form Builder row, saved product drawer layouts and saved / recent product table filters follow.
--  • Tax Type is removed. A product whose Tax Type was None keeps adding no tax to quotation / opportunity lines: its
--    Tax Rate becomes 0% (a line at GST 0% carries no tax, as --None-- did). GST / IGST changed nothing in any
--    calculation (the line's rate comes from Tax Rate). The column, its Form Builder row and its Tax Type dropdown go.
--    Saved product list cards (ModuleScorecard) on Category follow the rename; cards on Tax Type are removed.
--  • The "Sale Information" section of the product form is now "Product Information" (unless an admin renamed it).
--  • An index on [manufacturer] serves the Manufacturer suggestions (GET /api/products/manufacturers).
BEGIN TRY

BEGIN TRAN;

-- Category → Product Category.
EXEC sp_rename N'dbo.Product.category', N'productCategory', N'COLUMN';
EXEC sp_rename N'dbo.Product.Product_category_idx', N'Product_productCategory_idx', N'INDEX';

-- Tax Type None → Tax Rate 0%, then drop Tax Type.
EXEC(N'UPDATE [dbo].[Product] SET [taxRate] = N''0%'' WHERE [taxType] = N''None'';');
ALTER TABLE [dbo].[Product] DROP CONSTRAINT [Product_taxType_df];
ALTER TABLE [dbo].[Product] DROP COLUMN [taxType];

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_manufacturer_idx] ON [dbo].[Product]([manufacturer]);

-- Form Builder: Category → Product Category (an admin's own label stays).
UPDATE [dbo].[FormFieldDefinition]
SET [fieldKey] = N'productCategory',
    [label] = CASE WHEN [label] = N'Category' THEN N'Product Category' ELSE [label] END,
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'products' AND [isSystem] = 1 AND [fieldKey] = N'category'
    AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] c WHERE c.[module] = N'products' AND c.[fieldKey] = N'productCategory');

-- Form Builder: Tax Type field and its dropdown (kept if an admin linked another field to it).
DELETE FROM [dbo].[FormFieldDefinition]
WHERE [module] = N'products' AND [isSystem] = 1 AND [fieldKey] = N'taxType';

DELETE c FROM [dbo].[DropdownCategory] c
WHERE c.[key] = N'product_tax_type'
    AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] f WHERE f.[dropdownCategoryId] = c.[id]);

-- Form Builder: Sale Information → Product Information (every field of the section, built-in and custom).
UPDATE [dbo].[FormFieldDefinition]
SET [sectionKey] = N'product_information',
    [sectionLabel] = CASE WHEN [sectionLabel] = N'Sale Information' THEN N'Product Information' ELSE [sectionLabel] END,
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'products' AND [sectionKey] = N'sale_information';

-- Saved product drawer layouts and saved / recent product table filters.
UPDATE [dbo].[DrawerLayout]
SET [layoutJson] = REPLACE(REPLACE([layoutJson], N'"category"', N'"productCategory"'), N'"SALE INFORMATION & CLASSIFICATION"', N'"PRODUCT INFORMATION & CLASSIFICATION"'),
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'products' AND ([layoutJson] LIKE N'%"category"%' OR [layoutJson] LIKE N'%"SALE INFORMATION & CLASSIFICATION"%');

UPDATE [dbo].[TableFilter]
SET [criteriaJson] = REPLACE([criteriaJson], N'"category"', N'"productCategory"')
WHERE [module] = N'products' AND [criteriaJson] LIKE N'%"category"%';

-- Product list cards: cards on Category follow it; cards on Tax Type have no field left, so they go.
UPDATE [dbo].[ModuleScorecard] SET [fieldKey] = N'productCategory', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'products' AND [fieldKey] = N'category';
DELETE FROM [dbo].[ModuleScorecard] WHERE [module] = N'products' AND [fieldKey] = N'taxType';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
