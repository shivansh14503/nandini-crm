-- Email invite links for new users (Admin › Users): temporary passwords are gone.
--
--   UserInvites   one-time set-password links: the SHA-256 of the token (never the token), its purpose (invite | reset),
--                 expiry (72 h), usedAt (single use) and revokedAt (a newer link, an email change or another link used).
--                 CASCADE from Users.
--   Users         + [invitePending] (NOT NULL, default 0): "Invited" until the user sets a password from a link; sign-in
--                 is refused meanwhile. - [mustChangePassword] (the forced first-login change of a temporary password).
--
-- Backfill: users still on a temporary password (mustChangePassword = 1) become Invited. Their temporary password stops
-- working (sign-in answers INVITE_PENDING once it is typed correctly); an admin sends them a link with "Resend invite".
-- Must sort after every earlier migration (latest on main: 20261216110000_booking_video).
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[UserInvites] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [tokenHash] CHAR(64) NOT NULL,
    [purpose] NVARCHAR(20) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [revokedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UserInvites_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] NVARCHAR(50),
    CONSTRAINT [UserInvites_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UserInvites_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserInvites_userId_createdAt_idx] ON [dbo].[UserInvites]([userId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[UserInvites] ADD CONSTRAINT [UserInvites_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE [dbo].[Users] ADD [invitePending] BIT NOT NULL CONSTRAINT [Users_invitePending_df] DEFAULT 0;

-- Backfill (dynamic SQL: the batch is compiled before the new column exists).
EXEC(N'UPDATE [dbo].[Users] SET [invitePending] = 1 WHERE [mustChangePassword] = 1;');

-- AlterTable
ALTER TABLE [dbo].[Users] DROP CONSTRAINT [Users_mustChangePassword_df];
ALTER TABLE [dbo].[Users] DROP COLUMN [mustChangePassword];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
