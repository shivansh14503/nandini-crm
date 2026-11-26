-- My Profile › Notifications (Profile Phase 3): a user's own notification switches, default reminder and out of office.
-- UserPreference: new table, one row per user keyed by [userId], created on the user's first save. No row means every
-- default (all switches on, company default reminder, not out of office), which is the behaviour before this
-- migration, so nothing is backfilled. [outOfOfficeFrom] / [outOfOfficeTo] are inclusive business-timezone days (DATE,
-- like Holiday and Contract dates), both set or both NULL. Deleting a user deletes their row. No other table changes.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[UserPreference] (
    [userId] INT NOT NULL,
    [inAppActivityReminder] BIT NOT NULL CONSTRAINT [UserPreference_inAppActivityReminder_df] DEFAULT 1,
    [inAppActivityAssigned] BIT NOT NULL CONSTRAINT [UserPreference_inAppActivityAssigned_df] DEFAULT 1,
    [inAppActivityInvited] BIT NOT NULL CONSTRAINT [UserPreference_inAppActivityInvited_df] DEFAULT 1,
    [inAppContractRenewal] BIT NOT NULL CONSTRAINT [UserPreference_inAppContractRenewal_df] DEFAULT 1,
    [emailMorningSummary] BIT NOT NULL CONSTRAINT [UserPreference_emailMorningSummary_df] DEFAULT 1,
    [defaultReminder] NVARCHAR(30) NULL,
    [outOfOfficeFrom] DATE NULL,
    [outOfOfficeTo] DATE NULL,
    [outOfOfficeMessage] NVARCHAR(200) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UserPreference_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [UserPreference_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UserPreference_pkey] PRIMARY KEY CLUSTERED ([userId])
);

-- AddForeignKey
ALTER TABLE [dbo].[UserPreference] ADD CONSTRAINT [UserPreference_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
