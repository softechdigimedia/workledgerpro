
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma";
import { comparePassword } from "../../utils/password";
import { IDLE_TIMEOUT_MS, processIdleSessions, recordEmployeeReturnAfterIdle } from "./idle-monitor.service";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/jwt";

interface LoginInput {
  identifier: string;
  password: string;
}

interface LoginMetadata {
  ipAddress?: string;
  userAgent?: string;
}

const REFRESH_TOKEN_DAYS = 7;

const hashToken = (token: string): string => {
  return createHash("sha256").update(token).digest("hex");
};

export const loginUser = async (
  input: LoginInput,
  metadata: LoginMetadata = {}
) => {
  const identifier = input.identifier.trim();

  const normalizedEmail = identifier.toLowerCase();

  // Find user using email or employee code.
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        {
          employee: {
            is: {
              employeeCode: identifier,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,

      employee: {
        select: {
          id: true,
          employeeCode: true,
          department: true,
          designation: true,
          employmentStatus: true,
        },
      },
    },
  });

  // Use a generic error to avoid revealing account existence.
  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  // Verify credentials before making any account-side changes. In particular,
  // a failed login must never auto-provision an employee profile.
  const passwordMatches = await comparePassword(
    input.password,
    user.passwordHash
  );
  if (!passwordMatches) {
    return null;
  }

  let employee = user.employee;

  // Auto-provision employee profile if missing for an EMPLOYEE user
  if (user.role === "EMPLOYEE" && !employee) {
    const count = await prisma.employee.count();
    const employeeCode = `EMP-${String(1001 + count).padStart(4, "0")}`;
    employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode,
        department: "Operations",
        designation: "Field Associate",
        employmentStatus: "ACTIVE",
      },
      select: {
        id: true,
        employeeCode: true,
        department: true,
        designation: true,
        employmentStatus: true,
      },
    });
  }

  // Employees must also have active employment.
  if (
    user.role === "EMPLOYEE" &&
    (!employee ||
      employee.employmentStatus !== "ACTIVE")
  ) {
    return null;
  }

  // Reuse a recent active session for five minutes after last authenticated activity.
  const now = new Date();
  await processIdleSessions(now);
  await recordEmployeeReturnAfterIdle(user.id, now);
  const reusable = await prisma.refreshSession.findFirst({
    where: {
      userId: user.id, revokedAt: null, idleAt: null, expiresAt: { gt: now },
      lastActivityAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  // Expired sessions are made idle and revoked by processIdleSessions before a new login is issued.
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  let sessionId = "";
  let accessToken = "";
  let refreshToken = "";
  let resumed = false;

  if (reusable) {
    const candidateAccessToken = generateAccessToken(user.id, user.role, reusable.id);
    const candidateRefreshToken = generateRefreshToken(user.id, user.role, reusable.id);
    const updated = await prisma.refreshSession.updateMany({
      where: { id: reusable.id, userId: user.id, revokedAt: null, idleAt: null, expiresAt: { gt: now }, lastActivityAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) } },
      data: { tokenHash: hashToken(candidateRefreshToken), expiresAt, lastActivityAt: now, idleAt: null,
        ipAddress: metadata.ipAddress, userAgent: metadata.userAgent },
    });
    if (updated.count > 0) {
      sessionId = reusable.id;
      accessToken = candidateAccessToken;
      refreshToken = candidateRefreshToken;
      resumed = true;
    }
  }

  if (!resumed) {
    sessionId = randomUUID();
    accessToken = generateAccessToken(user.id, user.role, sessionId);
    refreshToken = generateRefreshToken(user.id, user.role, sessionId);
    await prisma.refreshSession.create({
      data: { id: sessionId, userId: user.id, tokenHash: hashToken(refreshToken), familyId: randomUUID(),
        expiresAt, lastActivityAt: now,
        ...(metadata.ipAddress !== undefined && { ipAddress: metadata.ipAddress }),
        ...(metadata.userAgent !== undefined && { userAgent: metadata.userAgent }) },
    });
  }

  if (user.role === "EMPLOYEE") {
    await prisma.employee.updateMany({
      where: { userId: user.id },
      data: { presenceStatus: "ACTIVE", idleSince: null, lastActivityAt: now },
    });
  }

  return {
    accessToken, refreshToken, sessionResumed: resumed,
    user: {
      id: user.id, name: user.name, email: user.email, phone: "+91 9876543210",
      role: user.role, status: user.status, subAdminId: "sub_admin_1",
      employeeProfileId: employee ? employee.id : null,
      employeeId: employee ? employee.id : null,
      employeeCode: employee ? employee.employeeCode : null,
      employee: employee ? { id: employee.id, employeeCode: employee.employeeCode,
        department: employee.department, designation: employee.designation } : null,
    },
  };
};
