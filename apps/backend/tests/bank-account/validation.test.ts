import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Bank-account input validation and data exposure", () => {
  const prefix = uniquePrefix("bankvalidation");
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  let admin: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => {
    employee = await authenticatedUser(prefix, "EMPLOYEE");
    admin = await authenticatedUser(prefix, "SUPER_ADMIN");
  });
  afterAll(async () => cleanupTestUsers(prefix));

  it("rejects account numbers beyond the accepted length", async () => {
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ accountNumber: "1".repeat(65), bankName: "Test Bank", ifscCode: "TEST0001234" });
    expect(res.status).toBe(400);
  });

  it("rejects an IFSC code beyond the accepted length", async () => {
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ accountNumber: "1234567890", bankName: "Test Bank", ifscCode: "X".repeat(21) });
    expect(res.status).toBe(400);
  });

  it("rejects too many tags", async () => {
    const tags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ accountNumber: "1234567890", bankName: "Test Bank", ifscCode: "TEST0001234", tags });
    expect(res.status).toBe(400);
  });

  it("rejects invalid primary flag types", async () => {
    const res = await http.post("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken)).send({ accountNumber: "1234567890", bankName: "Test Bank", ifscCode: "TEST0001234", isPrimary: "yes" });
    expect(res.status).toBe(400);
  });

  it("does not expose stored bank credentials in employee response", async () => {
    const res = await http.get("/api/v1/employee/bank-accounts").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/bankPassword|bankUsername/i);
  });

  it("allows elevated users to request bank-account directory", async () => {
    const res = await http.get("/api/v1/bank-accounts").set(authHeader(admin.accessToken));
    expect(res.status).toBe(200);
  });
});
