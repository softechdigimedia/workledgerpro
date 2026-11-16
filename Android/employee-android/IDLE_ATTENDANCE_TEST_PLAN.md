# Android idle-session and attendance restoration test plan

Run on an Android emulator or test device connected to a test backend and disposable PostgreSQL database.

## Preconditions

- Install the employee APK built from this project.
- Ensure the backend has the latest Prisma migrations applied.
- Create an active employee account assigned to a sub-admin.
- Keep the admin web dashboard open and signed in as the super-admin and assigned sub-admin.
- Confirm the employee has no open attendance session before the test.

## Test cases

### A. Return within 4:59

1. Sign in on Android.
2. Check in once.
3. Force-stop the app (do not log out).
4. Wait until 4 minutes 59 seconds have elapsed since the last successful authenticated API activity.
5. Reopen the app and sign in if prompted.
6. Confirm the login response reports `sessionResumed: true` where the app exposes it, and the same database `RefreshSession.id` is reused.
7. Confirm attendance status returns the existing open attendance session.
8. Confirm no second `AttendanceSession` was created.

Expected: active auth session is reused; attendance remains checked in.

### B. Exact 5:00 and 5:01 boundaries

Repeat the force-stop scenario twice, reopening at exactly five minutes and at five minutes one second after last authenticated API activity.

Expected:
- Old refresh session has `revokedAt` set and `idleAt = lastActivityAt + 5 minutes`.
- Employee `presenceStatus` becomes `IDLE`.
- A new login creates a different authentication session ID.
- Android calls `/api/v1/employee/attendance/status` and restores the existing open attendance session.
- No duplicate check-in is created.

### C. Idle administrator notification

1. Sign in and force-stop the app.
2. Leave it closed until 15 minutes have elapsed since the server set `idleAt` (normally about 20 minutes after last authenticated API activity).
3. Keep the admin dashboard open.

Expected:
- Employee remains `IDLE` in the employee list.
- A persisted `IDLE_ACTIVITY` notification appears for all active super-admins and the employee's assigned sub-admin.
- Notification contains employee identity and the exact server-side idle timestamp.

### D. Return after 15 minutes idle

1. Continue from test C.
2. Sign in again on Android.
3. Refresh the admin alert list.

Expected:
- A return notification appears.
- It contains both `idleAt` and `returnedAt` timestamps.
- Employee `presenceStatus` changes back to `ACTIVE`.
- Existing attendance status is restored independently of the new authentication session.
- No duplicate attendance check-in is created.

### E. Return before the 15-minute idle notification threshold

1. Force-stop after check-in.
2. Reopen after the five-minute session timeout but before 15 minutes have elapsed since `idleAt`.

Expected: employee returns to `ACTIVE`; the pending idle notification is cancelled; no delayed 15-minute idle alert is sent for that idle period.

## Current automation limitation

The repository includes Android attendance restoration code and the test plan, but emulator instrumentation has not been run in this environment. The archive also lacks the Gradle wrapper scripts/JAR, so Android Studio or a locally installed Gradle distribution is required to execute device tests.
