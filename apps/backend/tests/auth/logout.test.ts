import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { cleanupTestUsers, createTestUser, dbDescribe, getSession, http, loginAs, prisma, uniquePrefix } from "../helpers";

dbDescribe("POST /api/v1/auth/logout", () => {
  const prefix = uniquePrefix("logout");
  let fixture: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { fixture = await createTestUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("revokes the active session using the refresh token", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    const res = await http.post("/api/v1/auth/logout").send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    expect((await prisma.refreshSession.findUnique({ where: { id: session.id } }))?.revokedAt).not.toBeNull();
  });

  it("revokes the session using the access-token fallback", async () => {
    const tokens = await loginAs(fixture.email);
    const session = await getSession(fixture.user.id, tokens.accessToken);
    const res = await http.post("/api/v1/auth/logout").set("Authorization", `Bearer ${tokens.accessToken}`).send({});
    expect(res.status).toBe(200);
    expect((await prisma.refreshSession.findUnique({ where: { id: session.id } }))?.revokedAt).not.toBeNull();
  });

  it("returns success and clears cookie even for an invalid token", async () => {
    const res = await http.post("/api/v1/auth/logout").send({ refreshToken: "invalid-token" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.join(";")).toMatch(/refreshToken/i);
  });

  it("makes the old access token unusable after logout", async () => {
    const tokens = await loginAs(fixture.email);
    await http.post("/api/v1/auth/logout").send({ refreshToken: tokens.refreshToken });
    const res = await http.get("/api/v1/test/auth").set("Authorization", `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(401);
  });
});
