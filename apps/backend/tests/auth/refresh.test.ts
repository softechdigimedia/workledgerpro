import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { cleanupTestUsers, createTestUser, dbDescribe, getSession, http, loginAs, prisma, uniquePrefix } from "../helpers";

dbDescribe("POST /api/v1/auth/refresh", () => {
  const prefix = uniquePrefix("refresh");
  let fixture: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { fixture = await createTestUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("rotates a valid refresh token and updates the stored hash", async () => {
    const tokens = await loginAs(fixture.email);
    const before = await getSession(fixture.user.id, tokens.accessToken);
    const res = await http.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    const after = await prisma.refreshSession.findUnique({ where: { id: before.id } });
    expect(after?.tokenHash).not.toBe(before.tokenHash);
    expect(after?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.lastActivityAt.getTime());
  });

  it("rejects replay of the previous refresh token after rotation", async () => {
    const tokens = await loginAs(fixture.email);
    const rotated = await http.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
    expect(rotated.status).toBe(200);
    const replay = await http.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
    expect(replay.status).toBe(401);
  });

  it("rejects missing refresh token", async () => {
    expect((await http.post("/api/v1/auth/refresh").send({})).status).toBe(400);
  });

  it("rejects tampered refresh tokens", async () => {
    const tokens = await loginAs(fixture.email);
    const res = await http.post("/api/v1/auth/refresh").send({ refreshToken: `${tokens.refreshToken}tampered` });
    expect(res.status).toBe(401);
  });

  it("rejects an idle session and persists idle/revoked markers", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    await prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - 5 * 60 * 1000 - 1000) } });
    const res = await http.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(401);
    const updated = await prisma.refreshSession.findUnique({ where: { id: session.id } });
    expect(updated?.idleAt).not.toBeNull();
    expect(updated?.revokedAt).not.toBeNull();
  });

  it("does not allow refresh for an inactive user", async () => {
    const second = await createTestUser(prefix, "SUPER_ADMIN");
    const tokens = await loginAs(second.email);
    await prisma.user.update({ where: { id: second.user.id }, data: { status: "INACTIVE" } });
    const res = await http.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(401);
  });
});
