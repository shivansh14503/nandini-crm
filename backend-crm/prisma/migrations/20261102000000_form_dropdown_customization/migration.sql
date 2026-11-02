BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Organization] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Contact] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Lead] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Product] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Opportunity] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Quotation] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[Ticket] ADD [customDataJson] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[PartnerCompany] ADD [customDataJson] NVARCHAR(max);

-- CreateTable
CREATE TABLE [dbo].[DropdownCategory] (
    [id] NVARCHAR(50) NOT NULL,
    [key] NVARCHAR(80) NOT NULL,
    [label] NVARCHAR(120) NOT NULL,
    [module] NVARCHAR(40) NOT NULL,
    [description] NVARCHAR(300),
    [isSystem] BIT NOT NULL CONSTRAINT [DropdownCategory_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DropdownCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DropdownCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DropdownCategory_key_key] UNIQUE NONCLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[DropdownOption] (
    [id] NVARCHAR(50) NOT NULL,
    [categoryId] NVARCHAR(50) NOT NULL,
    [value] NVARCHAR(200) NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [metaJson] NVARCHAR(max),
    [sortOrder] INT NOT NULL CONSTRAINT [DropdownOption_sortOrder_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [DropdownOption_isActive_df] DEFAULT 1,
    [isSystem] BIT NOT NULL CONSTRAINT [DropdownOption_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DropdownOption_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DropdownOption_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DropdownOption_categoryId_value_key] UNIQUE NONCLUSTERED ([categoryId],[value])
);

-- CreateTable
CREATE TABLE [dbo].[FormFieldDefinition] (
    [id] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(40) NOT NULL,
    [fieldKey] NVARCHAR(80) NOT NULL,
    [label] NVARCHAR(120) NOT NULL,
    [fieldType] NVARCHAR(30) NOT NULL,
    [tabKey] NVARCHAR(40) NOT NULL,
    [sectionKey] NVARCHAR(80) NOT NULL,
    [sectionLabel] NVARCHAR(120) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [FormFieldDefinition_sortOrder_df] DEFAULT 0,
    [fieldSize] NVARCHAR(10),
    [placeholder] NVARCHAR(200),
    [hint] NVARCHAR(200),
    [defaultValue] NVARCHAR(500),
    [isRequired] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isRequired_df] DEFAULT 0,
    [isCoreLocked] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isCoreLocked_df] DEFAULT 0,
    [isSystem] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isSystem_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isActive_df] DEFAULT 1,
    [isVisibleInForm] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isVisibleInForm_df] DEFAULT 1,
    [isVisibleInDrawer] BIT NOT NULL CONSTRAINT [FormFieldDefinition_isVisibleInDrawer_df] DEFAULT 1,
    [dropdownCategoryId] NVARCHAR(50),
    [validationRulesJson] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FormFieldDefinition_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FormFieldDefinition_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FormFieldDefinition_module_fieldKey_key] UNIQUE NONCLUSTERED ([module],[fieldKey])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DropdownOption_categoryId_isActive_sortOrder_idx] ON [dbo].[DropdownOption]([categoryId], [isActive], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FormFieldDefinition_module_isActive_sortOrder_idx] ON [dbo].[FormFieldDefinition]([module], [isActive], [sortOrder]);

-- AddForeignKey
ALTER TABLE [dbo].[DropdownOption] ADD CONSTRAINT [DropdownOption_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[DropdownCategory]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FormFieldDefinition] ADD CONSTRAINT [FormFieldDefinition_dropdownCategoryId_fkey] FOREIGN KEY ([dropdownCategoryId]) REFERENCES [dbo].[DropdownCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
