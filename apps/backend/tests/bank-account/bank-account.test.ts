import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Bank-account API", () => {
  const prefix = uniquePrefix("bankacct");
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  let superAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    employee = await authenticatedUser(prefix, "EMPLOYEE");
    superAdmin = await authenticatedUser(prefix, "SUPER_ADMIN");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("requires authentication for the bank-account directory", async () => {
    expect((await http.get("/api/v1/bank-accounts")).status).toBe(401);
  });

  it("returns bank-account directory for authenticated users", async () => {
    const res = await http.get("/api/v1/bank-accounts").set(authHeader(superAdmin.accessToken));
    expect(res.status).toBe(200);
  });

  it("returns an employee's assigned accounts", async () => {
    const res = await http.get("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.bankAccounts ?? res.body.data?.bankAccounts).toBeDefined();
  });

  it("rejects account creation with missing required bank fields", async () => {
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ accountNumber: "1234" });
    expect(res.status).toBe(400);
  });

  it("rejects malformed bank-account IDs", async () => {
    const res = await http.patch("/api/v1/bank-accounts/%20/upi-status").set(authHeader(superAdmin.accessToken)).send({ isUpiActive: true });
    expect(res.status).toBe(400);
  });

  it("rejects invalid UPI status payload", async () => {
    const res = await http.patch("/api/v1/bank-accounts/unknown/upi-status").set(authHeader(superAdmin.accessToken)).send({ upiStatus: "ENABLED" });
    expect(res.status).toBe(400);
  });

  it("rejects an empty custom tag payload", async () => {
    const res = await http.post("/api/v1/bank-accounts/unknown/tags").set(authHeader(superAdmin.accessToken)).send({});
    expect(res.status).toBe(400);
  });

  it("rejects tags longer than the allowed length", async () => {
    const res = await http.post("/api/v1/bank-accounts/unknown/tags").set(authHeader(superAdmin.accessToken)).send({ tag: "x".repeat(41) });
    expect(res.status).toBe(400);
  });

  it("rejects a bank-account assignment with no account ID or bank details", async () => {
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ isPrimary: true });
    expect(res.status).toBe(400);
  });
});
