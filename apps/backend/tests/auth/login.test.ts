import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { cleanupTestUsers, createTestUser, dbDescribe, http, loginAs, PASSWORD, uniquePrefix, prisma } from "../helpers";

dbDescribe("POST /api/v1/auth/login", () => {
  const prefix = uniquePrefix("login");
  let active: Awaited<ReturnType<typeof createTestUser>>;
  let inactive: Awaited<ReturnType<typeof createTestUser>>;
  let employeeWithoutProfile: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    active = await createTestUser(prefix, "EMPLOYEE");
    inactive = await createTestUser(prefix, "SUPER_ADMIN", { status: "INACTIVE" });
    employeeWithoutProfile = await createTestUser(prefix, "EMPLOYEE", { withEmployee: false });
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("logs in with valid email and password", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: active.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(active.email);
    expect(res.headers["set-cookie"]?.join(";")).toMatch(/HttpOnly/i);
  });

  it("normalizes email case and whitespace", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: `  ${active.email.toUpperCase()}  `, password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("supports employee-code login", async () => {
    const res = await http.post("/api/v1/auth/login").send({ identifier: active.employee!.employeeCode, password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("rejects an incorrect password without disclosing account details", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: active.email, password: "incorrect-password" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  it("rejects an unknown account", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: `${prefix}missing@example.test`, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects inactive accounts", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: inactive.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it.each([
    [{ password: PASSWORD }, "missing identifier"],
    [{ email: "known-user@example.test", password: "" }, "empty password"],
    [{ email: "x", password: PASSWORD }, "short identifier"],
    [{ email: "not-an-email", password: PASSWORD }, "malformed email is treated as identifier then rejected by auth"]
  ])("validates login payload: %s", async (payload) => {
    const res = await http.post("/api/v1/auth/login").send(payload);
    expect([400, 401]).toContain(res.status);
  });

  it("does not auto-create an employee profile when password verification fails", async () => {
    const before = await prisma.employee.count({ where: { userId: employeeWithoutProfile.user.id } });
    const res = await http.post("/api/v1/auth/login").send({ email: employeeWithoutProfile.email, password: "wrong" });
    const after = await prisma.employee.count({ where: { userId: employeeWithoutProfile.user.id } });
    expect(res.status).toBe(401);
    expect(after).toBe(before);
  });

  it("auto-provisions an active employee profile only after successful credentials", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: employeeWithoutProfile.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const profile = await prisma.employee.findUnique({ where: { userId: employeeWithoutProfile.user.id } });
    expect(profile).not.toBeNull();
    expect(profile?.employmentStatus).toBe("ACTIVE");
  });
});
