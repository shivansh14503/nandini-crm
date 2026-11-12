BEGIN TRY

BEGIN TRAN;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_isDeleted_accountStatus_assignedUser_idx] ON [dbo].[Organization]([isDeleted], [accountStatus], [assignedUser]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Contact]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Lead]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Opportunity]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Quotation]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_contactId_idx] ON [dbo].[Quotation]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Ticket]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_contactId_idx] ON [dbo].[Ticket]([contactId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

