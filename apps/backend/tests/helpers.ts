import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

type Role = "SUPER_ADMIN" | "SUB_ADMIN" | "EMPLOYEE";
export const PASSWORD = "WorkLedger-Test-Pass-123!";
export const dbDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
export const http = request(app);

export async function createTestUser(
  prefix: string,
  role: Role = "EMPLOYEE",
  options: { status?: "ACTIVE" | "INACTIVE" | "SUSPENDED"; withEmployee?: boolean } = {}
) {
  const suffix = randomUUID().slice(0, 10);
  const email = `${prefix}${suffix}@example.test`.toLowerCase();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const withEmployee = options.withEmployee ?? role === "EMPLOYEE";
  const user = await prisma.user.create({
    data: {
      name: `Test ${role} ${suffix}`,
      email,
      passwordHash,
      role,
      status: options.status ?? "ACTIVE",
      ...(withEmployee
        ? {
            employee: {
              create: {
                employeeCode: `T${suffix.toUpperCase()}`,
                department: "QA",
                designation: "Test User",
                employmentStatus: "ACTIVE"
              }
            }
          }
        : {})
    },
    include: { employee: true }
  });
  return { user, email, password: PASSWORD, employee: user.employee };
}

export async function loginAs(email: string, password = PASSWORD) {
  const response = await http.post("/api/v1/auth/login").send({ email, password });
  if (response.status !== 200 || !response.body.accessToken) {
    throw new Error(`Test login failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return {
    response,
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
    user: response.body.user
  };
}

export async function authenticatedUser(prefix: string, role: Role = "EMPLOYEE", options: { status?: "ACTIVE" | "INACTIVE" | "SUSPENDED"; withEmployee?: boolean } = {}) {
  const fixture = await createTestUser(prefix, role, options);
  const tokens = await loginAs(fixture.email);
  return { ...fixture, ...tokens };
}

export function sessionIdFromAccessToken(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  if (typeof payload.sessionId !== "string") throw new Error("Access token has no sessionId");
  return payload.sessionId;
}

export async function getSession(userId: string, accessToken?: string) {
  const session = await prisma.refreshSession.findFirst({
    where: { userId, ...(accessToken ? { id: sessionIdFromAccessToken(accessToken) } : {}) },
    orderBy: { createdAt: "desc" }
  });
  if (!session) throw new Error(`No refresh session found for ${userId}`);
  return session;
}

export async function cleanupTestUsers(prefix: string) {
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function uniquePrefix(suite: string) {
  return `wltest-${suite}-${randomUUID().slice(0, 8)}-`;
}

export { prisma };
