-- Activities (Calendar Phase 1): calls, meetings, tasks, notes and any other Followup Type, each linked to at most one
-- CRM record (relatedModule + relatedId: a lead, opportunity, contact, organization, quotation, ticket or contract;
-- linked by convention, no foreign key) plus the organization / contact it concerns. ActivityAttendee holds the invited
-- colleagues, contacts and outside emails; it is owned by its activity and cascades from it.
--
-- Activity.startAt / endAt are TRUE UTC instants (with the zone they were entered in, timeZone), unlike
-- Ticket.dueDate and Contract.renewalReminderDate, which are business-timezone wall clocks stored as if UTC.
-- All-day activities run from business-timezone midnight of the first day to midnight after the last day.
--
-- The three filtered unique indexes on ActivityAttendee are hand-written (Prisma can't model filtered indexes);
-- they are named in schema.prisma and must stay out of it.
--
-- The string defaults ('Call', 'Planned', 'Asia/Kolkata', 'needsAction') are plain ASCII, so Prisma's literals
-- without the N prefix lose nothing (an N'' literal would read as drift on the next migrate dev).
--
-- Data touch-ups on the Followup Type dropdown (shared_followup_type) change only what an admin hasn't changed:
--   • its description, if it still reads as shipped;
--   • the default duration / icon meta of the built-in types, where an option has no meta yet;
--   • an admin option spelled 'task' / 'NOTE' (any case but the exact one) is renamed to 'Task' / 'Note', with the
--     leads and opportunities that stored that spelling: the code compares those values exactly, and start-up
--     seeding adds them as system options offered on Activities only;
--   • Task / Note can't be a default (new Lead / Opportunity forms hide them and their API refuses them).
-- No option or form field rows are inserted here: start-up seeding (formConfig.seed.ts) adds the Activities fields,
-- the activity_status / activity_reminder dropdowns and the Task / Note options.
--
-- Leads / opportunities already storing Task or Note keep them (their APIs refuse only a change to one). Check with:
--   SELECT 'Lead', COUNT(*) FROM [dbo].[Lead] WHERE [followupType] IN (N'Task', N'Note')
--   UNION ALL SELECT 'Opportunity', COUNT(*) FROM [dbo].[Opportunity] WHERE [followupType] IN (N'Task', N'Note');
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Activity] (
    [id] NVARCHAR(50) NOT NULL,
    [followupType] NVARCHAR(30) NOT NULL CONSTRAINT [Activity_followupType_df] DEFAULT 'Call',
    [subject] NVARCHAR(200) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [Activity_status_df] DEFAULT 'Planned',
    [assignedTo] NVARCHAR(50) NOT NULL,
    [relatedModule] NVARCHAR(30),
    [relatedId] NVARCHAR(50),
    [relatedTo] NVARCHAR(200),
    [relatedCode] NVARCHAR(50),
    [organizationName] NVARCHAR(200),
    [organizationId] NVARCHAR(50),
    [contact] NVARCHAR(100),
    [contactId] NVARCHAR(50),
    [startAt] DATETIME2,
    [endAt] DATETIME2,
    [allDay] BIT NOT NULL CONSTRAINT [Activity_allDay_df] DEFAULT 0,
    [timeZone] NVARCHAR(64) NOT NULL CONSTRAINT [Activity_timeZone_df] DEFAULT 'Asia/Kolkata',
    [location] NVARCHAR(250),
    [reminder] NVARCHAR(30),
    [remindAt] DATETIME2,
    [reminderSentAt] DATETIME2,
    [customerResponse] NVARCHAR(100),
    [remarks] NVARCHAR(2000),
    [completedAt] DATETIME2,
    [completedBy] NVARCHAR(50),
    [revision] INT NOT NULL CONSTRAINT [Activity_revision_df] DEFAULT 0,
    [customDataJson] NVARCHAR(max),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Activity_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Activity_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Activity_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ActivityAttendee] (
    [id] NVARCHAR(50) NOT NULL,
    [activityId] NVARCHAR(50) NOT NULL,
    [kind] NVARCHAR(10) NOT NULL,
    [username] NVARCHAR(50),
    [contactId] NVARCHAR(50),
    [email] NVARCHAR(120),
    [name] NVARCHAR(200) NOT NULL,
    [responseStatus] NVARCHAR(20) NOT NULL CONSTRAINT [ActivityAttendee_responseStatus_df] DEFAULT 'needsAction',
    [respondedAt] DATETIME2,
    [sortOrder] INT NOT NULL CONSTRAINT [ActivityAttendee_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ActivityAttendee_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ActivityAttendee_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_isDeleted_startAt_idx] ON [dbo].[Activity]([isDeleted], [startAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_isDeleted_assignedTo_startAt_idx] ON [dbo].[Activity]([isDeleted], [assignedTo], [startAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_relatedModule_relatedId_idx] ON [dbo].[Activity]([relatedModule], [relatedId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_organizationId_idx] ON [dbo].[Activity]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_contactId_idx] ON [dbo].[Activity]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_status_idx] ON [dbo].[Activity]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_reminderSentAt_remindAt_idx] ON [dbo].[Activity]([reminderSentAt], [remindAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_isDeleted_createdAt_idx] ON [dbo].[Activity]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_isDeleted_assignedTo_createdAt_idx] ON [dbo].[Activity]([isDeleted], [assignedTo], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityAttendee_activityId_idx] ON [dbo].[ActivityAttendee]([activityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityAttendee_username_idx] ON [dbo].[ActivityAttendee]([username]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityAttendee_contactId_idx] ON [dbo].[ActivityAttendee]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityAttendee_email_idx] ON [dbo].[ActivityAttendee]([email]);

-- AddForeignKey
ALTER TABLE [dbo].[Activity] ADD CONSTRAINT [Activity_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Activity] ADD CONSTRAINT [Activity_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityAttendee] ADD CONSTRAINT [ActivityAttendee_activityId_fkey] FOREIGN KEY ([activityId]) REFERENCES [dbo].[Activity]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityAttendee] ADD CONSTRAINT [ActivityAttendee_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Hand-written: one row per colleague, contact and outside email of an activity (Prisma can't model filtered indexes).
CREATE UNIQUE NONCLUSTERED INDEX [UX_ActivityAttendee_user]
ON [dbo].[ActivityAttendee]([activityId], [username])
WHERE [username] IS NOT NULL;

CREATE UNIQUE NONCLUSTERED INDEX [UX_ActivityAttendee_contact]
ON [dbo].[ActivityAttendee]([activityId], [contactId])
WHERE [contactId] IS NOT NULL;

CREATE UNIQUE NONCLUSTERED INDEX [UX_ActivityAttendee_email]
ON [dbo].[ActivityAttendee]([activityId], [email])
WHERE [kind] = 'email';

-- Data: the Followup Type dropdown now also lists activity types (description only if the admin hasn't changed it).
UPDATE [dbo].[DropdownCategory]
SET [description] = N'How the follow-up or activity happens (Leads, Opportunities, Activities). Task and Note are offered on Activities only.',
    [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'shared_followup_type' AND [description] = N'How the next follow-up happens (Leads, Opportunities).';

-- Data: default duration (minutes) and icon of the built-in Followup Types, kept in the option's meta so they survive
-- a rename. Only options without meta; a renamed option has none and falls back to 30 minutes and the generic icon.
UPDATE o SET o.[metaJson] = N'{"durationMinutes":15,"icon":"call"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Call' AND o.[metaJson] IS NULL;
UPDATE o SET o.[metaJson] = N'{"durationMinutes":60,"icon":"meeting"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Meeting' AND o.[metaJson] IS NULL;
UPDATE o SET o.[metaJson] = N'{"durationMinutes":60,"icon":"presentation"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Demo / Presentation' AND o.[metaJson] IS NULL;
UPDATE o SET o.[metaJson] = N'{"durationMinutes":0,"icon":"email"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Email' AND o.[metaJson] IS NULL;
UPDATE o SET o.[metaJson] = N'{"durationMinutes":0,"icon":"whatsapp"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'WhatsApp' AND o.[metaJson] IS NULL;
UPDATE o SET o.[metaJson] = N'{"durationMinutes":120,"icon":"visit"}', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Site Visit' AND o.[metaJson] IS NULL;

-- Data: an admin option spelled 'task' / 'NOTE' (equal ignoring case, different exactly; the binary collation tells
-- them apart) becomes 'Task' / 'Note', and so do the leads and opportunities that stored that spelling. Without it the
-- option would keep a spelling the code doesn't recognize once seeding marks it a system option.
UPDATE r SET r.[followupType] = N'Task'
FROM [dbo].[Lead] r
JOIN [dbo].[DropdownOption] o ON r.[followupType] COLLATE Latin1_General_100_BIN2 = o.[value] COLLATE Latin1_General_100_BIN2
JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Task' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Task';
UPDATE r SET r.[followupType] = N'Task'
FROM [dbo].[Opportunity] r
JOIN [dbo].[DropdownOption] o ON r.[followupType] COLLATE Latin1_General_100_BIN2 = o.[value] COLLATE Latin1_General_100_BIN2
JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Task' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Task';
UPDATE o SET o.[value] = N'Task', o.[label] = N'Task', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Task' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Task';
UPDATE r SET r.[followupType] = N'Note'
FROM [dbo].[Lead] r
JOIN [dbo].[DropdownOption] o ON r.[followupType] COLLATE Latin1_General_100_BIN2 = o.[value] COLLATE Latin1_General_100_BIN2
JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Note' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Note';
UPDATE r SET r.[followupType] = N'Note'
FROM [dbo].[Opportunity] r
JOIN [dbo].[DropdownOption] o ON r.[followupType] COLLATE Latin1_General_100_BIN2 = o.[value] COLLATE Latin1_General_100_BIN2
JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Note' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Note';
UPDATE o SET o.[value] = N'Note', o.[label] = N'Note', o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] = N'Note' AND o.[value] COLLATE Latin1_General_100_BIN2 <> N'Note';

-- Data: Task / Note are offered on Activities only, so neither can be the pre-selected Followup Type of new records.
UPDATE o SET o.[isDefault] = 0, o.[updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type' AND o.[value] IN (N'Task', N'Note') AND o.[isDefault] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
