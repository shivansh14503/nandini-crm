-- Admin › Roles: a role's permissions per module (View / Create / Edit / Delete / Export / Import at All, Own or None)
-- and whether it opens the admin panel. `Users.Role` keeps holding the role's name. The table starts empty: start-up
-- seeding (src/modules/roles/roleSeed.ts) adds a row for every role users hold, with the access the role's name gave
-- before, so nobody's access changes.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Roles] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(50) NOT NULL,
    [description] NVARCHAR(500),
    [adminPanel] BIT NOT NULL CONSTRAINT [Roles_adminPanel_df] DEFAULT 0,
    [permissionsJson] NVARCHAR(max) NOT NULL,
    [isSystem] BIT NOT NULL CONSTRAINT [Roles_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Roles_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [Roles_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] NVARCHAR(50),
    CONSTRAINT [Roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Roles_name_key] UNIQUE NONCLUSTERED ([name])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
