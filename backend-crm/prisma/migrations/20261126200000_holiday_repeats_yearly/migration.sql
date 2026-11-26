-- Holidays: a holiday can repeat every year. [repeatsYearly] = 1 means it falls on the same day and month every year;
-- such a row keeps that day and month in [holidayDate] with the placeholder year 1904 (a leap year, so 29 Feb fits,
-- and below the 2000–2100 range a one-off holiday can have, so the unique (holidayDate, occasion) index keeps working
-- for both kinds). Existing holidays stay one-off (default 0). Adds one column; no row is changed.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Holiday] ADD [repeatsYearly] BIT NOT NULL CONSTRAINT [Holiday_repeatsYearly_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
