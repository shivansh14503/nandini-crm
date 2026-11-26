-- Holidays (Admin › Holidays): company holidays an admin adds, edits or imports. Active ones show on the calendar
-- as all-day entries. (holidayDate, occasion) is unique, so the same holiday can't be added or imported twice (the
-- default case-insensitive collation also treats 'holi' and 'Holi' as the same occasion).
--
-- The string defaults ('Public', 'Active') are plain ASCII, so Prisma's literals without the N prefix lose nothing.
-- New table only: no existing table or row is changed.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Holiday] (
    [id] NVARCHAR(50) NOT NULL,
    [occasion] NVARCHAR(100) NOT NULL,
    [holidayDate] DATE NOT NULL,
    [holidayType] NVARCHAR(30) NOT NULL CONSTRAINT [Holiday_holidayType_df] DEFAULT 'Public',
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [Holiday_status_df] DEFAULT 'Active',
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Holiday_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Holiday_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Holiday_holidayDate_occasion_key] UNIQUE NONCLUSTERED ([holidayDate],[occasion])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Holiday_status_holidayDate_idx] ON [dbo].[Holiday]([status], [holidayDate]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
