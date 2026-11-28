-- Security groups (Admin › Security Groups): teams / branches for record visibility. A role's new "Group" access level
-- (roles/permissions.ts) shows a user the records owned or created by anyone who shares a group with them; a parent
-- group's members also see its sub-groups' records.
--
--   SecurityGroups        one row per group (name unique, optional parent, archived = isActive 0).
--   SecurityGroupMembers  (groupId, userId) memberships; removed with their group or user.
-- No backfill: there are no groups yet, and no role has the Group level until an admin picks it, so nobody's access
-- changes.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[SecurityGroups] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(max),
    [parentId] INT,
    [isActive] BIT NOT NULL CONSTRAINT [SecurityGroups_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SecurityGroups_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [SecurityGroups_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedBy] NVARCHAR(50),
    CONSTRAINT [SecurityGroups_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SecurityGroups_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[SecurityGroupMembers] (
    [groupId] INT NOT NULL,
    [userId] INT NOT NULL,
    [addedAt] DATETIME2 NOT NULL CONSTRAINT [SecurityGroupMembers_addedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [addedBy] NVARCHAR(50),
    CONSTRAINT [SecurityGroupMembers_pkey] PRIMARY KEY CLUSTERED ([groupId],[userId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SecurityGroups_parentId_idx] ON [dbo].[SecurityGroups]([parentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SecurityGroupMembers_userId_idx] ON [dbo].[SecurityGroupMembers]([userId]);

-- AddForeignKey
ALTER TABLE [dbo].[SecurityGroups] ADD CONSTRAINT [SecurityGroups_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [dbo].[SecurityGroups]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SecurityGroupMembers] ADD CONSTRAINT [SecurityGroupMembers_groupId_fkey] FOREIGN KEY ([groupId]) REFERENCES [dbo].[SecurityGroups]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SecurityGroupMembers] ADD CONSTRAINT [SecurityGroupMembers_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

