-- Track employee operational presence separately from account activation.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IDLE_ACTIVITY';

CREATE TYPE "EmployeePresenceStatus" AS ENUM ('ACTIVE', 'IDLE');

ALTER TABLE "employees"
  ADD COLUMN "presenceStatus" "EmployeePresenceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastActivityAt" TIMESTAMP(3),
  ADD COLUMN "idleSince" TIMESTAMP(3);

ALTER TABLE "notifications" ADD COLUMN "metadata" JSONB;

ALTER TABLE "refresh_sessions"
  ADD COLUMN "idleNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "returnedAt" TIMESTAMP(3);

CREATE INDEX "employees_presenceStatus_idleSince_idx"
  ON "employees"("presenceStatus", "idleSince");
CREATE INDEX "refresh_sessions_idleAt_idleNotifiedAt_idx"
  ON "refresh_sessions"("idleAt", "idleNotifiedAt");
