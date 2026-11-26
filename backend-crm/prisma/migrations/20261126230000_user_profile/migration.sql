-- My Profile (Profile Phase 1): a user keeps their own first and last name, mobile, office phone and photo, and can
-- change their own password.
-- Users: adds [firstName], [lastName], [officePhone] and [passwordChangedAt] (all NULL). [fullName] stays (every
-- screen, the audit log and quotation PDFs read it) and the API keeps it equal to trim(firstName + ' ' + lastName)
-- on every profile write; [phone] stays the mobile number. Existing names are split once: firstName = the text
-- before the first space of the trimmed fullName, lastName = the rest (trimmed, NULL when empty); a blank fullName
-- leaves both NULL. No other column or row changes.
-- UserPhoto: new table, one profile photo per user (bytes in the database like RecordFile). A new upload gets a new
-- row id, so /api/user-photos/:id can be cached forever. Deleting a user deletes their photo.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Users] ADD
    [firstName] NVARCHAR(100) NULL,
    [lastName] NVARCHAR(100) NULL,
    [officePhone] NVARCHAR(20) NULL,
    [passwordChangedAt] DATETIME2 NULL;

-- Backfill. Dynamic SQL: the new columns don't exist yet when this batch is compiled.
EXEC(N'UPDATE u
SET [firstName] = CASE WHEN p.[pos] = 0 THEN t.[name] ELSE LEFT(t.[name], p.[pos] - 1) END,
    [lastName] = CASE WHEN p.[pos] = 0 THEN NULL ELSE NULLIF(LTRIM(RTRIM(SUBSTRING(t.[name], p.[pos] + 1, 4000))), N'''') END
FROM [dbo].[Users] u
CROSS APPLY (SELECT LTRIM(RTRIM(u.[fullName])) AS [name]) t
CROSS APPLY (SELECT CHARINDEX(N'' '', t.[name]) AS [pos]) p
WHERE t.[name] <> N'''';');

-- CreateTable
CREATE TABLE [dbo].[UserPhoto] (
    [id] NVARCHAR(50) NOT NULL,
    [userId] INT NOT NULL,
    [mimeType] NVARCHAR(50) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [data] VARBINARY(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UserPhoto_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UserPhoto_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UserPhoto_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- AddForeignKey
ALTER TABLE [dbo].[UserPhoto] ADD CONSTRAINT [UserPhoto_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
