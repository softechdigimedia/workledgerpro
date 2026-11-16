import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Sub-admin API", () => {
  const prefix = uniquePrefix("subadmin");
  let subAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  let superAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    subAdmin = await authenticatedUser(prefix, "SUB_ADMIN");
    employee = await authenticatedUser(prefix, "EMPLOYEE");
    superAdmin = await authenticatedUser(prefix, "SUPER_ADMIN");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("rejects requests without authentication", async () => {
    expect((await http.get("/api/v1/admin/dashboard")).status).toBe(401);
  });

  it("denies employee access to sub-admin dashboard", async () => {
    const res = await http.get("/api/v1/admin/dashboard").set(authHeader(employee.accessToken));
    expect(res.status).toBe(403);
  });

  it("allows a sub-admin to load the dashboard", async () => {
    const res = await http.get("/api/v1/admin/dashboard").set(authHeader(subAdmin.accessToken));
    expect(res.status).toBe(200);
  });

  it("allows a super-admin to use sub-admin routes", async () => {
    const res = await http.get("/api/v1/admin/employees").set(authHeader(superAdmin.accessToken));
    expect(res.status).toBe(200);
  });

  it("validates employee IDs before querying details", async () => {
    const res = await http.get("/api/v1/admin/employees/%20").set(authHeader(subAdmin.accessToken));
    expect([400, 404]).toContain(res.status);
  });

  it("validates allocation amount as positive", async () => {
    const res = await http.post("/api/v1/admin/allocations").set(authHeader(subAdmin.accessToken)).send({ employeeId: employee.employee!.id, amount: -20 });
    expect(res.status).toBe(400);
  });

  it("rejects approval decisions with malformed IDs", async () => {
    const res = await http.post("/api/v1/admin/finance/requests/not-an-id/approve").set(authHeader(subAdmin.accessToken)).send({ reason: "QA" });
    expect(res.status).toBe(400);
  });

  it("validates pagination bounds", async () => {
    const res = await http.get("/api/v1/admin/finance/requests?page=0&limit=999").set(authHeader(subAdmin.accessToken));
    expect(res.status).toBe(400);
  });
});
