-- The company holidays of 2024 and 2025 from the old CRM's Holidays list (21 rows, all Active, Holiday Type Public),
-- so Admin › Holidays and the calendar start with data. A row is skipped when that occasion is already a holiday on
-- that date (the unique (holidayDate, occasion) index), so running this after holidays were added or imported by hand
-- is safe. Data only: no table changes. Added as 'system'; not in the audit log (written outside the API).
BEGIN TRY

BEGIN TRAN;

INSERT INTO [dbo].[Holiday] ([id], [occasion], [holidayDate], [holidayType], [status], [createdBy], [createdAt], [updatedAt])
SELECT LOWER(CONVERT(NVARCHAR(50), NEWID())), v.[occasion], v.[holidayDate], N'Public', N'Active', N'system', SYSUTCDATETIME(), SYSUTCDATETIME()
FROM (VALUES
    (N'New Year', CAST('2024-01-01' AS DATE)),
    (N'Republic Day', CAST('2024-01-26' AS DATE)),
    (N'Holi', CAST('2024-03-25' AS DATE)),
    (N'Independence day', CAST('2024-08-15' AS DATE)),
    (N'Raksha Bandhan', CAST('2024-08-19' AS DATE)),
    (N'Krishna Janmashtmi', CAST('2024-08-26' AS DATE)),
    (N'Gandhi Jayanti', CAST('2024-10-02' AS DATE)),
    (N'Dussehra', CAST('2024-10-12' AS DATE)),
    (N'Deepawali', CAST('2024-10-31' AS DATE)),
    (N'Goverdhan Pooja', CAST('2024-11-02' AS DATE)),
    (N'Bhaiya Dooj', CAST('2024-11-03' AS DATE)),
    (N'New Year', CAST('2025-01-01' AS DATE)),
    (N'Republic Day', CAST('2025-01-26' AS DATE)),
    (N'Holi', CAST('2025-03-13' AS DATE)),
    (N'Raksha Bandhan', CAST('2025-08-09' AS DATE)),
    (N'Independence day', CAST('2025-08-15' AS DATE)),
    (N'Krishna Janmashtmi', CAST('2025-08-16' AS DATE)),
    (N'Gandhi Jayanti/Dussehra', CAST('2025-10-02' AS DATE)),
    (N'Deepawali', CAST('2025-10-20' AS DATE)),
    (N'Goverdhan Pooja', CAST('2025-10-21' AS DATE)),
    (N'Bhaiya Dooj', CAST('2025-10-22' AS DATE))
) AS v ([occasion], [holidayDate])
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[Holiday] h WHERE h.[holidayDate] = v.[holidayDate] AND h.[occasion] = v.[occasion]
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
