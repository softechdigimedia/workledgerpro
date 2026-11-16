import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";

export type UserRole = "SUPER_ADMIN" | "SUB_ADMIN" | "EMPLOYEE";

export interface TokenPayload {
  sub: string;
  role: UserRole;
  sessionId: string;
  jti: string;
}

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export const generateAccessToken = (userId: string, role: UserRole, sessionId: string): string =>
  jwt.sign({ sub: userId, role, sessionId, jti: randomUUID() }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

export const generateRefreshToken = (userId: string, role: UserRole, sessionId: string): string =>
  jwt.sign({ sub: userId, role, sessionId, jti: randomUUID() }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

const verifyToken = (token: string, secret: string): TokenPayload => {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === "string" || !decoded.sub || !decoded.sessionId ||
      !["SUPER_ADMIN", "SUB_ADMIN", "EMPLOYEE"].includes(decoded.role as string)) {
    throw new Error("Invalid token payload");
  }
  return { sub: decoded.sub, role: decoded.role as UserRole, sessionId: decoded.sessionId, jti: String(decoded.jti || "") };
};

export const verifyAccessToken = (token: string): TokenPayload => verifyToken(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token: string): TokenPayload => verifyToken(token, env.JWT_REFRESH_SECRET);
