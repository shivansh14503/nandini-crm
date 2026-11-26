-- Admin › Users (Profile Phase 2): admins add, edit, deactivate and reset the password of CRM users.
-- Users: adds [jobTitle] (free text), [reportsToId] (the user's manager, a self reference with NO ACTION, indexed),
-- [mustChangePassword] (NOT NULL, default 0: set for a new user and after an admin password reset; the API then allows
-- only the change-password and sign-out routes until the user picks a new password), [createdBy] (the admin's
-- username) and [deactivatedAt]. Nothing is backfilled: existing users keep mustChangePassword = 0 and NULL elsewhere.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Users] ADD
    [jobTitle] NVARCHAR(100) NULL,
    [reportsToId] INT NULL,
    [mustChangePassword] BIT NOT NULL CONSTRAINT [Users_mustChangePassword_df] DEFAULT 0,
    [createdBy] NVARCHAR(50) NULL,
    [deactivatedAt] DATETIME2 NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Users_reportsToId_idx] ON [dbo].[Users]([reportsToId]);

-- AddForeignKey
ALTER TABLE [dbo].[Users] ADD CONSTRAINT [Users_reportsToId_fkey] FOREIGN KEY ([reportsToId]) REFERENCES [dbo].[Users]([Id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
