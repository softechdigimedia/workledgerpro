import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Role-based access control", () => {
  const prefix = uniquePrefix("rbac");
  let superAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  let subAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    superAdmin = await authenticatedUser(prefix, "SUPER_ADMIN");
    subAdmin = await authenticatedUser(prefix, "SUB_ADMIN");
    employee = await authenticatedUser(prefix, "EMPLOYEE");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("allows all authenticated roles on the generic authenticated test route", async () => {
    for (const token of [superAdmin.accessToken, subAdmin.accessToken, employee.accessToken]) {
      expect((await http.get("/api/v1/test/auth").set(authHeader(token))).status).toBe(200);
    }
  });

  it("allows only super-admin on the super-admin test route", async () => {
    expect((await http.get("/api/v1/test/super-admin").set(authHeader(superAdmin.accessToken))).status).toBe(200);
    expect((await http.get("/api/v1/test/super-admin").set(authHeader(subAdmin.accessToken))).status).toBe(403);
    expect((await http.get("/api/v1/test/super-admin").set(authHeader(employee.accessToken))).status).toBe(403);
  });

  it("allows super-admin and sub-admin on shared admin test route", async () => {
    expect((await http.get("/api/v1/test/admin").set(authHeader(superAdmin.accessToken))).status).toBe(200);
    expect((await http.get("/api/v1/test/admin").set(authHeader(subAdmin.accessToken))).status).toBe(200);
    expect((await http.get("/api/v1/test/admin").set(authHeader(employee.accessToken))).status).toBe(403);
  });

  it("rejects missing, malformed and expired bearer tokens", async () => {
    expect((await http.get("/api/v1/test/auth")).status).toBe(401);
    expect((await http.get("/api/v1/test/auth").set("Authorization", "Bearer garbage")).status).toBe(401);
    expect((await http.get("/api/v1/test/auth").set("Authorization", "Basic abc")).status).toBe(401);
  });

  it("does not allow inactive users to continue using an existing token", async () => {
    const { prisma } = await import("../helpers");
    await prisma.user.update({ where: { id: employee.user.id }, data: { status: "SUSPENDED" } });
    const res = await http.get("/api/v1/test/auth").set(authHeader(employee.accessToken));
    expect(res.status).toBe(401);
  });

  it("prevents employee access to super-admin management endpoints", async () => {
    for (const path of ["/api/v1/super-admin/users", "/api/v1/super-admin/reports", "/api/v1/super-admin/settings"]) {
      expect((await http.get(path).set(authHeader(employee.accessToken))).status).toBe(403);
    }
  });
});
