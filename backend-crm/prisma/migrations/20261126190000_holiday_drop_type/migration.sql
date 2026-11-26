-- Holidays: drop Holiday Type (Public / Optional / Company). The option was removed from Admin › Holidays, so a
-- holiday is just an occasion, a date and a status. The column's default constraint has to go before the column.
-- Only the [holidayType] column of [Holiday] is removed; no other column or row is changed.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Holiday] DROP CONSTRAINT [Holiday_holidayType_df];
ALTER TABLE [dbo].[Holiday] DROP COLUMN [holidayType];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
