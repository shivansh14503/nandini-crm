-- Data fix: older demo seed data and user pickers stored the signed-in user as "username (You)". Owner columns now
-- drive row-level access (src/modules/shared/accessControl.ts), so the suffix would hide records from their owner.
-- New writes are normalized by assertAssigneeValid; this cleans existing rows. LIKE follows the column collation
-- (case-insensitive by default), so "(you)" is matched too. Values that are only "(You)" are left alone.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[Organization] SET [assignedUser] = RTRIM(LEFT([assignedUser], LEN([assignedUser]) - 5))
WHERE [assignedUser] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedUser], LEN([assignedUser]) - 5))) > 0;

UPDATE [dbo].[Contact] SET [assignedTo] = RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))
WHERE [assignedTo] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))) > 0;

UPDATE [dbo].[Lead] SET [assignedTo] = RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))
WHERE [assignedTo] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))) > 0;

UPDATE [dbo].[Opportunity] SET [assignedTo] = RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))
WHERE [assignedTo] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))) > 0;

UPDATE [dbo].[Quotation] SET [assignedTo] = RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))
WHERE [assignedTo] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))) > 0;

UPDATE [dbo].[Ticket] SET [assignedTo] = RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))
WHERE [assignedTo] LIKE N'%(You)' AND LEN(RTRIM(LEFT([assignedTo], LEN([assignedTo]) - 5))) > 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
