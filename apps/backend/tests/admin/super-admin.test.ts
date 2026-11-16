import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, prisma, uniquePrefix } from "../helpers";

dbDescribe("Super-admin API", () => {
  const prefix = uniquePrefix("superadmin");
  let superAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    superAdmin = await authenticatedUser(prefix, "SUPER_ADMIN");
    employee = await authenticatedUser(prefix, "EMPLOYEE");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("requires authentication", async () => {
    expect((await http.get("/api/v1/super-admin/dashboard")).status).toBe(401);
  });

  it("denies non-super-admin users", async () => {
    const res = await http.get("/api/v1/super-admin/dashboard").set(authHeader(employee.accessToken));
    expect(res.status).toBe(403);
  });

  it("allows super-admin dashboard and users listing", async () => {
    const dashboard = await http.get("/api/v1/super-admin/dashboard").set(authHeader(superAdmin.accessToken));
    const users = await http.get("/api/v1/super-admin/users").set(authHeader(superAdmin.accessToken));
    expect(dashboard.status).toBe(200);
    expect(users.status).toBe(200);
  });

  it("creates an employee and profile", async () => {
    const email = `${prefix}created@example.test`;
    const res = await http.post("/api/v1/super-admin/users").set(authHeader(superAdmin.accessToken)).send({ name: "Created QA Employee", email, password: "Secure-Test-123", role: "EMPLOYEE" });
    expect(res.status).toBe(201);
    const saved = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
    expect(saved?.employee).not.toBeNull();
  });

  it("rejects invalid user creation payload", async () => {
    const res = await http.post("/api/v1/super-admin/users").set(authHeader(superAdmin.accessToken)).send({ name: "", email: "bad", password: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate email addresses", async () => {
    const res = await http.post("/api/v1/super-admin/users").set(authHeader(superAdmin.accessToken)).send({ name: "Duplicate", email: employee.email, password: "Secure-Test-123" });
    expect(res.status).toBe(409);
  });

  it("changes user status and persists it", async () => {
    const res = await http.patch(`/api/v1/super-admin/users/${employee.user.id}/status`).set(authHeader(superAdmin.accessToken)).send({ status: "INACTIVE" });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: employee.user.id } }))?.status).toBe("INACTIVE");
  });

  it("rejects unsupported user status values", async () => {
    const res = await http.patch(`/api/v1/super-admin/users/${employee.user.id}/status`).set(authHeader(superAdmin.accessToken)).send({ status: "DELETED" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when changing status for an unknown user", async () => {
    const res = await http.patch("/api/v1/super-admin/users/00000000-0000-4000-8000-000000000000/status").set(authHeader(superAdmin.accessToken)).send({ status: "ACTIVE" });
    expect(res.status).toBe(404);
  });

  it("rejects weak password change requests", async () => {
    const res = await http.post(`/api/v1/super-admin/users/${employee.user.id}/change-password`).set(authHeader(superAdmin.accessToken)).send({ password: "123" });
    expect(res.status).toBe(400);
  });

  it("validates list pagination", async () => {
    const res = await http.get("/api/v1/super-admin/users?page=-1&limit=500").set(authHeader(superAdmin.accessToken));
    expect(res.status).toBe(400);
  });
});
