import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { cleanupTestUsers, createTestUser, dbDescribe, prisma, uniquePrefix } from "../helpers";

dbDescribe("PostgreSQL database integration", () => {
  const prefix = uniquePrefix("database");
  let fixture: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { fixture = await createTestUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("persists users and employee profiles across independent queries", async () => {
    const user = await prisma.user.findUnique({ where: { id: fixture.user.id } });
    const employee = await prisma.employee.findUnique({ where: { userId: fixture.user.id } });
    expect(user?.email).toBe(fixture.email);
    expect(employee?.employeeCode).toBe(fixture.employee?.employeeCode);
  });

  it("enforces unique user email addresses", async () => {
    await expect(prisma.user.create({ data: { name: "Duplicate", email: fixture.email, passwordHash: "hash", role: "EMPLOYEE" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one employee profile per user", async () => {
    await expect(prisma.employee.create({ data: { userId: fixture.user.id, employeeCode: `DUP-${Date.now()}` } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("persists refresh-session idle tracking columns", async () => {
    const session = await prisma.refreshSession.create({ data: { userId: fixture.user.id, tokenHash: `hash-${Date.now()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000), lastActivityAt: new Date(), idleAt: null } });
    const loaded = await prisma.refreshSession.findUnique({ where: { id: session.id } });
    expect(loaded?.lastActivityAt).toBeInstanceOf(Date);
    expect(loaded?.idleAt).toBeNull();
  });

  it("enforces foreign-key integrity for employee ownership", async () => {
    await expect(prisma.employee.create({ data: { userId: randomUUID(), employeeCode: `ORPHAN-${Date.now()}` } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("cascades employee and session cleanup when a test user is removed", async () => {
    const temporary = await createTestUser(prefix, "EMPLOYEE");
    await prisma.refreshSession.create({ data: { userId: temporary.user.id, tokenHash: `cleanup-${Date.now()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.user.delete({ where: { id: temporary.user.id } });
    expect(await prisma.employee.findUnique({ where: { userId: temporary.user.id } })).toBeNull();
    expect(await prisma.refreshSession.count({ where: { userId: temporary.user.id } })).toBe(0);
  });
});
