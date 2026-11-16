import { prisma } from "../../config/prisma";

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const ADMIN_IDLE_NOTIFICATION_MS = 15 * 60 * 1000;

const formatTimestamp = (value: Date) => value.toISOString();

type EmployeeWithUser = {
  id: string;
  employeeCode: string;
  assignedSubAdminId: string | null;
  user: { name: string };
};

async function getAdministratorIds(employee: EmployeeWithUser | null): Promise<string[]> {
  const where: any = { status: "ACTIVE", OR: [{ role: "SUPER_ADMIN" }] };
  if (employee?.assignedSubAdminId) where.OR.push({ id: employee.assignedSubAdminId, role: "SUB_ADMIN" });
  const admins = await prisma.user.findMany({ where, select: { id: true } });
  return [...new Set<string>(admins.map((admin: any) => admin.id))];
}

async function createIdleNotifications(args: {
  sessionId: string;
  employee: EmployeeWithUser | null;
  idleAt: Date;
  returnedAt?: Date;
}) {
  if (!args.employee) return;
  const recipients = await getAdministratorIds(args.employee);
  if (!recipients.length) return;

  const isReturn = Boolean(args.returnedAt);
  const title = isReturn
    ? `Employee returned after extended idle: ${args.employee.user.name}`
    : `Employee idle for 15 minutes: ${args.employee.user.name}`;
  const message = isReturn
    ? `${args.employee.user.name} (${args.employee.employeeCode}) became idle at ${formatTimestamp(args.idleAt)} and logged in again at ${formatTimestamp(args.returnedAt!)}.`
    : `${args.employee.user.name} (${args.employee.employeeCode}) became idle at ${formatTimestamp(args.idleAt)} and has remained idle for at least 15 minutes.`;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: "IDLE_ACTIVITY" as const,
      title,
      message,
      link: "/super-admin/alerts",
      metadata: {
        event: isReturn ? "EMPLOYEE_RETURNED" : "EMPLOYEE_IDLE_15_MIN",
        employeeId: args.employee!.id,
        employeeName: args.employee!.user.name,
        employeeCode: args.employee!.employeeCode,
        sessionId: args.sessionId,
        idleAt: formatTimestamp(args.idleAt),
        ...(args.returnedAt ? { returnedAt: formatTimestamp(args.returnedAt) } : {}),
      },
    })),
  });
}

/**
 * Marks sessions idle using the exact server-side threshold (last activity + 5m),
 * then sends one persisted admin notification after a further 15m of idle time.
 * Safe to call from a timer and immediately before login processing.
 */
export async function processIdleSessions(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
  const staleSessions = await prisma.refreshSession.findMany({
    where: { revokedAt: null, lastActivityAt: { lte: cutoff } },
    select: { id: true, userId: true, lastActivityAt: true },
  });

  for (const session of staleSessions) {
    const idleAt = new Date(session.lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
    const claimed = await prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, lastActivityAt: { lte: cutoff } },
      data: { idleAt, revokedAt: now },
    });
    if (claimed.count > 0) {
      const otherActiveSession = await prisma.refreshSession.findFirst({
        where: { userId: session.userId, id: { not: session.id }, revokedAt: null, expiresAt: { gt: now }, lastActivityAt: { gt: cutoff } },
        select: { id: true },
      });
      if (!otherActiveSession) {
        await prisma.employee.updateMany({
          where: { userId: session.userId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lte: session.lastActivityAt } }] },
          data: { presenceStatus: "IDLE", idleSince: idleAt, lastActivityAt: session.lastActivityAt },
        });
      }
    }
  }

  // Expire sessions whose refresh lifetime ended without pretending that token expiry is inactivity.
  await prisma.refreshSession.updateMany({
    where: { revokedAt: null, expiresAt: { lte: now }, lastActivityAt: { gt: cutoff } },
    data: { revokedAt: now },
  });

  const notifyCutoff = new Date(now.getTime() - ADMIN_IDLE_NOTIFICATION_MS);
  const dueSessions = await prisma.refreshSession.findMany({
    where: { idleAt: { lte: notifyCutoff }, idleNotifiedAt: null, returnedAt: null },
    include: { user: { include: { employee: true } } },
  });

  for (const session of dueSessions) {
    const activeSession = await prisma.refreshSession.findFirst({
      where: { userId: session.userId, revokedAt: null, expiresAt: { gt: now }, lastActivityAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) } },
      select: { id: true },
    });
    if (activeSession) {
      await prisma.refreshSession.updateMany({ where: { id: session.id, returnedAt: null }, data: { returnedAt: now } });
      continue;
    }
    const employee = session.user.employee
      ? {
          id: session.user.employee.id,
          employeeCode: session.user.employee.employeeCode,
          assignedSubAdminId: session.user.employee.assignedSubAdminId,
          user: { name: session.user.name },
        }
      : null;
    const claimed = await prisma.refreshSession.updateMany({
      where: { id: session.id, idleNotifiedAt: null, returnedAt: null },
      data: { idleNotifiedAt: now },
    });
    if (claimed.count > 0) {
      await createIdleNotifications({ sessionId: session.id, employee, idleAt: session.idleAt! });
    }
  }
}

/** Called after valid credentials are confirmed and before a new session is issued. */
export async function recordEmployeeReturnAfterIdle(userId: string, now = new Date()): Promise<void> {
  const sessions = await prisma.refreshSession.findMany({
    where: { userId, idleAt: { not: null }, returnedAt: null },
    orderBy: { idleAt: "desc" },
    include: { user: { include: { employee: true } } },
  });

  for (const session of sessions) {
    if (!session.idleAt) continue;
    const idleDuration = now.getTime() - session.idleAt.getTime();
    const isExtendedIdle = idleDuration >= ADMIN_IDLE_NOTIFICATION_MS;
    const claimed = await prisma.refreshSession.updateMany({
      where: { id: session.id, returnedAt: null },
      data: { returnedAt: now },
    });
    if (claimed.count === 0 || !isExtendedIdle) continue;

    const employee = session.user.employee
      ? {
          id: session.user.employee.id,
          employeeCode: session.user.employee.employeeCode,
          assignedSubAdminId: session.user.employee.assignedSubAdminId,
          user: { name: session.user.name },
        }
      : null;
    // If the periodic worker was delayed or offline, preserve the first idle alert before the return alert.
    if (!session.idleNotifiedAt) {
      await createIdleNotifications({ sessionId: session.id, employee, idleAt: session.idleAt });
      await prisma.refreshSession.updateMany({
        where: { id: session.id, idleNotifiedAt: null },
        data: { idleNotifiedAt: now },
      });
    }
    await createIdleNotifications({ sessionId: session.id, employee, idleAt: session.idleAt, returnedAt: now });
  }

  await prisma.employee.updateMany({
    where: { userId },
    data: { presenceStatus: "ACTIVE", idleSince: null, lastActivityAt: now },
  });
}
