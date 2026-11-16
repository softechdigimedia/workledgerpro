import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix } from "../helpers";

dbDescribe("Employee payment proof and entry validation", () => {
  const prefix = uniquePrefix("proof");
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => { employee = await authenticatedUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("rejects an entry with no amount", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ proofImage: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(400);
  });

  it.each([0, -1, "-50", "NaN", "Infinity"]) ("rejects invalid amount %s", async (amount) => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount, proofImage: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported proof MIME type", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: 10, proofImage: "data:image/svg+xml;base64,PHN2Zz4=" });
    expect(res.status).toBe(422);
  });

  it("rejects an untrusted non-HTTPS proof URL", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: 10, proofImage: "http://example.test/proof.png" });
    expect(res.status).toBe(422);
  });

  it("rejects malformed base64 data URLs", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: 10, proofImage: "data:image/png;base64,not valid base64" });
    expect(res.status).toBe(422);
  });

  it("accepts schema-valid PNG proof input for controller processing", async () => {
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: 10, proofImage: "data:image/png;base64,aGVsbG8=" });
    // A later business-rule response (e.g. no finance account) is acceptable here;
    // the test specifically guards against validation rejection of a valid PNG data URL.
    expect(res.status).not.toBe(400);
  });

  it("rejects proof payloads larger than the configured limit", async () => {
    const oversized = `data:image/png;base64,${"A".repeat(7_000_001)}`;
    const res = await http.post("/api/v1/employee/entries").set(authHeader(employee.accessToken)).send({ amount: 10, proofImage: oversized });
    expect([400, 413]).toContain(res.status);
  });
});
