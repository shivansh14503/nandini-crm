-- Booking links (Calendar Phase 4): public scheduling pages (/book/<slug>). An employee (or an admin for a team member)
-- offers free times from their CRM activities and company calendar; a visitor picks one and the CRM creates a meeting
-- activity owned by the link's owner (booking-links/bookingLink.public.ts).
--
--   BookingLink         one public page: owner, type, durations, weekly hours (business time zone), buffers, notice,
--                       horizon, daily cap, questions, optional related record. Never hard-deleted (isActive), so a
--                       slug is never reused. slug is unique (plain unique constraint: every row, active or not).
--   BookingLinkBooking  one booking that came in from the internet: the activity it created, the visitor's details and
--                       the sha256 of the slot token it used (unique: a token books once).
--
-- New tables only; no existing data changes. The company switch lives in ModuleSetting activities/bookingLinks (no row
-- = off). Notification.kind gains 'booking_created' (NVARCHAR(40), no schema change); Activity.origin gains 'booking'
-- (NVARCHAR(20), no schema change). Must sort after 20261128090000_calendar_admin_connect (and P2-3b's 20261128100000).
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[BookingLink] (
    [id] NVARCHAR(50) NOT NULL,
    [slug] NVARCHAR(60) NOT NULL,
    [ownerUsername] NVARCHAR(50) NOT NULL,
    [title] NVARCHAR(120) NOT NULL,
    [followupType] NVARCHAR(30) NOT NULL CONSTRAINT [BookingLink_followupType_df] DEFAULT 'Meeting',
    [durationsJson] NVARCHAR(200) NOT NULL,
    [slotStepMinutes] INT NOT NULL CONSTRAINT [BookingLink_slotStepMinutes_df] DEFAULT 30,
    [location] NVARCHAR(250),
    [note] NVARCHAR(1000),
    [availabilityJson] NVARCHAR(max) NOT NULL,
    [bufferBeforeMinutes] INT NOT NULL CONSTRAINT [BookingLink_bufferBeforeMinutes_df] DEFAULT 0,
    [bufferAfterMinutes] INT NOT NULL CONSTRAINT [BookingLink_bufferAfterMinutes_df] DEFAULT 0,
    [minNoticeMinutes] INT NOT NULL CONSTRAINT [BookingLink_minNoticeMinutes_df] DEFAULT 240,
    [horizonDays] INT NOT NULL CONSTRAINT [BookingLink_horizonDays_df] DEFAULT 30,
    [maxPerDay] INT,
    [reminder] NVARCHAR(30),
    [askPhone] BIT NOT NULL CONSTRAINT [BookingLink_askPhone_df] DEFAULT 0,
    [askCompany] BIT NOT NULL CONSTRAINT [BookingLink_askCompany_df] DEFAULT 0,
    [relatedModule] NVARCHAR(30),
    [relatedId] NVARCHAR(50),
    [isActive] BIT NOT NULL CONSTRAINT [BookingLink_isActive_df] DEFAULT 1,
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BookingLink_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [BookingLink_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingLink_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BookingLink_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[BookingLinkBooking] (
    [id] NVARCHAR(50) NOT NULL,
    [bookingLinkId] NVARCHAR(50) NOT NULL,
    [activityId] NVARCHAR(50) NOT NULL,
    [ownerUsername] NVARCHAR(50) NOT NULL,
    [startAt] DATETIME2 NOT NULL,
    [endAt] DATETIME2 NOT NULL,
    [visitorName] NVARCHAR(100) NOT NULL,
    [visitorEmail] NVARCHAR(120) NOT NULL,
    [visitorPhone] NVARCHAR(30),
    [visitorCompany] NVARCHAR(200),
    [contactId] NVARCHAR(50),
    [tokenHash] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BookingLinkBooking_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BookingLinkBooking_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BookingLinkBooking_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingLink_ownerUsername_isActive_idx] ON [dbo].[BookingLink]([ownerUsername], [isActive]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingLinkBooking_bookingLinkId_startAt_idx] ON [dbo].[BookingLinkBooking]([bookingLinkId], [startAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BookingLinkBooking_bookingLinkId_createdAt_idx] ON [dbo].[BookingLinkBooking]([bookingLinkId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[BookingLinkBooking] ADD CONSTRAINT [BookingLinkBooking_bookingLinkId_fkey] FOREIGN KEY ([bookingLinkId]) REFERENCES [dbo].[BookingLink]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

