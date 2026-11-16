import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { processIdleSessions, recordEmployeeReturnAfterIdle } from "../../src/modules/auth/idle-monitor.service";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const dbIt = enabled ? it : it.skip;
const prisma = new PrismaClient();

describe("PostgreSQL idle lifecycle", () => {
  const suffix = randomUUID();
  const employeeEmail = `idle-employee-${suffix}@example.test`;
  const superEmail = `idle-super-${suffix}@example.test`;
  const subEmail = `idle-sub-${suffix}@example.test`;
  let employeeUserId = "";
  let employeeId = "";
  let superAdminId = "";
  let subAdminId = "";

  beforeAll(async () => {
    if (!enabled) return;
    const superAdmin = await prisma.user.create({ data: { name: "Idle Test Super Admin", email: superEmail, passwordHash: "test", role: "SUPER_ADMIN" } });
    const subAdmin = await prisma.user.create({ data: { name: "Idle Test Sub Admin", email: subEmail, passwordHash: "test", role: "SUB_ADMIN" } });
    superAdminId = superAdmin.id;
    subAdminId = subAdmin.id;
    const employee = await prisma.user.create({
      data: {
        name: "Idle Test Employee", email: employeeEmail, passwordHash: "test", role: "EMPLOYEE",
        employee: { create: { employeeCode: `IDLE-${suffix.slice(0, 8)}`, assignedSubAdminId: subAdmin.id } },
      }, include: { employee: true },
    });
    employeeUserId = employee.id;
    employeeId = employee.employee!.id;
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.notification.deleteMany({ where: { userId: { in: [superAdminId, subAdminId] } } });
      await prisma.refreshSession.deleteMany({ where: { userId: employeeUserId } });
      await prisma.user.deleteMany({ where: { id: { in: [employeeUserId, superAdminId, subAdminId] } } });
    }
    await prisma.$disconnect();
  });

  dbIt("marks 4:59 active and 5:00/5:01 idle using exact server-side threshold", async () => {
    const base = new Date("2026-11-13T08:00:00.000Z");
    const cases = [
      { label: "4:59", ago: 4 * 60_000 + 59_000, idle: false },
      { label: "5:00", ago: 5 * 60_000, idle: true },
      { label: "5:01", ago: 5 * 60_000 + 1_000, idle: true },
    ];
    const sessions = [] as Array<{ id: string; userId: string; employeeId: string; label: string; lastActivityAt: Date; idle: boolean }>;
    const temporaryUserIds: string[] = [];
    for (const item of cases) {
      const lastActivityAt = new Date(base.getTime() - item.ago);
      const testUser = await prisma.user.create({
        data: {
          name: `Boundary ${item.label}`,
          email: `idle-boundary-${item.label.replace(':', '')}-${suffix}@example.test`,
          passwordHash: "test", role: "EMPLOYEE",
          employee: { create: { employeeCode: `BND-${item.label.replace(':', '')}-${suffix.slice(0, 5)}` } },
        }, include: { employee: true },
      });
      temporaryUserIds.push(testUser.id);
      const session = await prisma.refreshSession.create({ data: {
        userId: testUser.id, tokenHash: `idle-${suffix}-${item.label}`, familyId: randomUUID(),
        expiresAt: new Date(base.getTime() + 60 * 60_000), lastActivityAt,
      } });
      sessions.push({ id: session.id, userId: testUser.id, employeeId: testUser.employee!.id, label: item.label, lastActivityAt, idle: item.idle });
    }
    try {
      await processIdleSessions(base);
      for (const item of sessions) {
        const saved = await prisma.refreshSession.findUniqueOrThrow({ where: { id: item.id } });
        expect(Boolean(saved.revokedAt)).toBe(item.idle);
        if (item.idle) expect(saved.idleAt?.toISOString()).toBe(new Date(item.lastActivityAt.getTime() + 5 * 60_000).toISOString());
        const employee = await prisma.employee.findUniqueOrThrow({ where: { id: item.employeeId } });
        expect(employee.presenceStatus).toBe(item.idle ? "IDLE" : "ACTIVE");
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: temporaryUserIds } } });
    }
  });

  dbIt("sends the 15-minute idle alert and a return alert with both timestamps", async () => {
    const idleAt = new Date("2026-11-13T09:00:00.000Z");
    const lastActivityAt = new Date(idleAt.getTime() - 5 * 60_000);
    const session = await prisma.refreshSession.create({ data: {
      userId: employeeUserId, tokenHash: `idle-return-${suffix}`, familyId: randomUUID(),
      expiresAt: new Date(idleAt.getTime() + 60 * 60_000), lastActivityAt,
    } });
    await processIdleSessions(idleAt);
    const notifyAt = new Date(idleAt.getTime() + 15 * 60_000);
    await processIdleSessions(notifyAt);
    const idleNotifications = await prisma.notification.findMany({
      where: { userId: { in: [superAdminId, subAdminId] }, type: "IDLE_ACTIVITY", message: { contains: "remained idle" } },
    });
    expect(idleNotifications).toHaveLength(2);
    const returnedAt = new Date(idleAt.getTime() + 16 * 60_000);
    await recordEmployeeReturnAfterIdle(employeeUserId, returnedAt);
    const returnNotifications = await prisma.notification.findMany({
      where: { userId: { in: [superAdminId, subAdminId] }, type: "IDLE_ACTIVITY", message: { contains: "logged in again" } },
    });
    expect(returnNotifications).toHaveLength(2);
    expect(returnNotifications[0].message).toContain(idleAt.toISOString());
    expect(returnNotifications[0].message).toContain(returnedAt.toISOString());
    const saved = await prisma.refreshSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(saved.returnedAt?.toISOString()).toBe(returnedAt.toISOString());
  });
});
