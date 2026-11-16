import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, cleanupTestUsers, createTestUser, dbDescribe, getSession, http, loginAs, prisma, uniquePrefix } from "../helpers";

dbDescribe("Five-minute inactivity policy", () => {
  const prefix = uniquePrefix("idle");
  let fixture: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { fixture = await createTestUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("accepts authenticated activity at 4:59", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    await prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 299_000) } });
    const res = await http.get("/api/v1/test/auth").set(authHeader(tokens.accessToken));
    expect(res.status).toBe(200);
  });

  it("rejects activity at exactly 5:00 and revokes the session", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    await prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 300_000) } });
    const res = await http.get("/api/v1/test/auth").set(authHeader(tokens.accessToken));
    expect(res.status).toBe(401);
    const updated = await prisma.refreshSession.findUnique({ where: { id: session.id } });
    expect(updated?.idleAt).not.toBeNull();
    expect(updated?.revokedAt).not.toBeNull();
  });

  it("rejects activity at 5:01", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    await prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 301_000) } });
    const res = await http.get("/api/v1/test/auth").set(authHeader(tokens.accessToken));
    expect(res.status).toBe(401);
  });

  it("updates lastActivityAt after a successful authenticated request", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    const before = session.lastActivityAt.getTime();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const res = await http.get("/api/v1/test/auth").set(authHeader(tokens.accessToken));
    expect(res.status).toBe(200);
    const after = await prisma.refreshSession.findUnique({ where: { id: session.id } });
    expect(after!.lastActivityAt.getTime()).toBeGreaterThan(before);
  });

  it("reuses a still-active session on login before the idle threshold", async () => {
    const first = await loginAs(fixture.email);
    const firstSession = await getSession(fixture.user.id, first.accessToken);
    const second = await loginAs(fixture.email);
    const secondSession = await getSession(fixture.user.id, second.accessToken);
    expect(second.response.body.sessionResumed).toBe(true);
    expect(secondSession.id).toBe(firstSession.id);
    expect(second.accessToken).not.toBe(first.accessToken);
  });

  it("creates a new auth session after idle expiry", async () => {
    const first = await loginAs(fixture.email);
    const oldSession = await getSession(fixture.user.id, first.accessToken);
    await prisma.refreshSession.update({ where: { id: oldSession.id }, data: { lastActivityAt: new Date(Date.now() - 301_000) } });
    const second = await loginAs(fixture.email);
    const sessions = await prisma.refreshSession.findMany({ where: { userId: fixture.user.id }, orderBy: { createdAt: "asc" } });
    expect(second.response.body.sessionResumed).toBe(false);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.find((s) => s.id === oldSession.id)?.revokedAt).not.toBeNull();
    expect(first.accessToken).not.toBe(second.accessToken);
  });

  it("keeps attendance independent from auth-session expiry and does not duplicate check-in", async () => {
    const tokens = await loginAs(fixture.email);
    const employeeId = fixture.employee!.id;
    const checkIn = await http.post("/api/v1/employee/attendance/check-in").set(authHeader(tokens.accessToken)).send({ notes: "test" });
    expect(checkIn.status).toBe(200);
    const beforeCount = await prisma.attendanceSession.count({ where: { employeeId } });
    const session = await getSession(fixture.user.id, tokens.accessToken);
    await prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 301_000) } });
    const expired = await http.get("/api/v1/test/auth").set(authHeader(tokens.accessToken));
    expect(expired.status).toBe(401);
    const newTokens = await loginAs(fixture.email);
    const status = await http.get("/api/v1/employee/attendance/status").set(authHeader(newTokens.accessToken));
    expect(status.status).toBe(200);
    expect(status.body.isCheckedIn ?? status.body.data?.isCheckedIn).toBe(true);
    expect(await prisma.attendanceSession.count({ where: { employeeId } })).toBe(beforeCount);
  });
});
