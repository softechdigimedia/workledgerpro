import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Employee API", () => {
  const prefix = uniquePrefix("employee");
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  let admin: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    employee = await authenticatedUser(prefix, "EMPLOYEE");
    admin = await authenticatedUser(prefix, "SUPER_ADMIN");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("requires authentication for employee dashboard", async () => {
    const res = await http.get("/api/v1/employee/dashboard");
    expect(res.status).toBe(401);
  });

  it("allows an employee to load their dashboard", async () => {
    const res = await http.get("/api/v1/employee/dashboard").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
  });

  it("allows an employee to load finance summary", async () => {
    const res = await http.get("/api/v1/employee/finance").set(authHeader(employee.accessToken));
    expect([200, 404]).toContain(res.status);
  });

  it("allows an employee to load their entries list", async () => {
    const res = await http.get("/api/v1/employee/entries").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
  });

  it("allows elevated admin roles to use employee module routes", async () => {
    const res = await http.get("/api/v1/employee/attendance/status").set(authHeader(admin.accessToken));
    expect([200, 404]).toContain(res.status);
  });

  it("rejects malformed entry amounts before controller execution", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: -10 });
    expect(res.status).toBe(400);
  });

  it("rejects an entry without an amount", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ remarks: "missing amount" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid punch type", async () => {
    const res = await http.post("/api/v1/employee/punches").set(authHeader(employee.accessToken)).send({ punchType: "BREAK" });
    expect(res.status).toBe(400);
  });
});
