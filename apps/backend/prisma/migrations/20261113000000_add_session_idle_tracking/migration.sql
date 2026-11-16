ALTER TABLE "refresh_sessions"
  ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "idleAt" TIMESTAMP(3);

CREATE INDEX "refresh_sessions_userId_revokedAt_lastActivityAt_idx"
  ON "refresh_sessions"("userId", "revokedAt", "lastActivityAt");
