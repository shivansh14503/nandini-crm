-- Account lockout after repeated wrong passwords (auth/accountLockout.ts). Sign-in was only limited per network
-- address; now the account itself is locked for a cool-down after too many wrong passwords in a row.
--
--   Users  + [failedLoginCount]  (NOT NULL, default 0): wrong passwords in the current run.
--          + [lastFailedLoginAt] (NULL): when the last one was typed (an old run starts again from 1).
--          + [lockedUntil]       (NULL): sign-in refused until then; an admin can clear it ("Unlock account").
-- No backfill: every account starts unlocked with a count of 0.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Users] ADD [failedLoginCount] INT NOT NULL CONSTRAINT [Users_failedLoginCount_df] DEFAULT 0,
[lastFailedLoginAt] DATETIME2,
[lockedUntil] DATETIME2;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
