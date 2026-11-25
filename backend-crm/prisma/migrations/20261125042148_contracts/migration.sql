-- Contracts module (Support › Contracts): support contracts linked to an organization, contact and opportunity.
-- The only string default ('Not Started') is plain ASCII, so Prisma's literal without the N prefix loses nothing
-- (an N'' literal would read as drift on the next migrate dev).
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Contract] (
    [id] NVARCHAR(50) NOT NULL,
    [contractNumber] NVARCHAR(50) NOT NULL,
    [contractTitle] NVARCHAR(100) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [Contract_status_df] DEFAULT 'Not Started',
    [contractValue] DECIMAL(18,2),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [organizationName] NVARCHAR(200) NOT NULL,
    [organizationId] NVARCHAR(50),
    [contact] NVARCHAR(100) NOT NULL,
    [contactId] NVARCHAR(50),
    [opportunity] NVARCHAR(200),
    [opportunityId] NVARCHAR(50),
    [tallySerialNo] NVARCHAR(30),
    [startDate] DATE,
    [endDate] DATE,
    [contractPeriod] NVARCHAR(100),
    [renewalReminderDate] DATETIME2,
    [contractTypeJson] NVARCHAR(max),
    [billNumber] NVARCHAR(30),
    [billDate] DATE,
    [billAmount] DECIMAL(18,2),
    [description] NVARCHAR(2000),
    [customDataJson] NVARCHAR(max),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contract_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Contract_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Contract_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Contract_contractNumber_key] UNIQUE NONCLUSTERED ([contractNumber])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_status_idx] ON [dbo].[Contract]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_assignedTo_idx] ON [dbo].[Contract]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_organizationId_idx] ON [dbo].[Contract]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_contactId_idx] ON [dbo].[Contract]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_opportunityId_idx] ON [dbo].[Contract]([opportunityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_endDate_idx] ON [dbo].[Contract]([endDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_renewalReminderDate_idx] ON [dbo].[Contract]([renewalReminderDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_isDeleted_createdAt_idx] ON [dbo].[Contract]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Contract]([isDeleted], [assignedTo], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Contract] ADD CONSTRAINT [Contract_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contract] ADD CONSTRAINT [Contract_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contract] ADD CONSTRAINT [Contract_opportunityId_fkey] FOREIGN KEY ([opportunityId]) REFERENCES [dbo].[Opportunity]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
